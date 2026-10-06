// UI: state, rendering, the chord editor, playback and MIDI download.
import {
  parseKey, KEY_OPTIONS, KEY_SIG, FN_NAME, INVERSION_NAMES, HOME, cid, toneCount, numeral, label, figure,
  spell, chordSymbol, homeEntry, cadenceGroups, relation, fnOf, optionsBefore, canPrecede,
} from "./theory.js";
import { newId, deriveBar, deriveBackward, emptyPart, finalPart, flatten, regroup, freshBars, splitBar, samePart, timeline, syncBars, successorOf } from "./generator.js";
import { realize } from "./voicing.js";
import { ensureAudio, audioTime, playNotes, stopAll } from "./audio.js";
import { buildMidi, zipBytes } from "./midi.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

const state = { key: "C", borrow: .25, chroma: .3, inversions: .2, bars: [], sel: null };
const K = () => parseKey(state.key);
const opt = () => ({ key: K(), borrow: state.borrow, chroma: state.chroma, inversions: state.inversions, rnd: Math.random });
const flat = () => flatten(state.bars);
const setFlat = (list) => { state.bars = syncBars(regroup(state.bars, list)); };
// The next chord that actually differs (skipping parts that just repeat this one)
function nextDistinct(fl, f) {
  for (let j = f + 1; j < fl.length; j++) if (cid(fl[j].chord) !== cid(fl[f].chord)) return fl[j].chord;
  return null;
}
function locate(partId) {
  let f = 0;
  for (let b = 0; b < state.bars.length; b++) {
    const ps = state.bars[b].parts;
    for (let p = 0; p < ps.length; p++, f++) if (ps[p].id === partId) return { b, p, f };
  }
  return null;
}

/* ------------------------------------------------------- undo / redo */
// Every change to the key or the progression is recorded, so earlier progressions can be recalled.
const history = { past: [], future: [] };
const snapshot = () => ({ key: state.key, bars: structuredClone(state.bars) });
const sameSnap = (a, b) => a.key === b.key && JSON.stringify(a.bars) === JSON.stringify(b.bars);
function change(fn) {
  const before = snapshot();
  fn();
  if (!sameSnap(before, snapshot())) {
    history.past.push(before);
    if (history.past.length > 100) history.past.shift();
    history.future = [];
  }
  updateHistory();
}
function restore(snap) {
  const modeBefore = K().mode;
  state.key = snap.key;
  $("key").value = snap.key;
  state.bars = snap.bars;
  if (state.sel != null && !locate(state.sel)) state.sel = null;
  render();
  updateHistory();
  return modeBefore;
}
function undo() {
  if (!history.past.length) return;
  history.future.push(snapshot());
  restore(history.past.pop());
  setStatus("Restored the previous progression.");
}
function redo() {
  if (!history.future.length) return;
  history.past.push(snapshot());
  restore(history.future.pop());
  setStatus("Restored the progression you undid.");
}
function updateHistory() {
  $("undo").disabled = !history.past.length;
  $("redo").disabled = !history.future.length;
}

/* ------------------------------------------------------------ playback */
let playing = false, timers = [];
const barDur = () => (4 * 60) / +$("bpm").value; // 4/4, one bar per chord slot

// One entry per part; held parts (a repeat of the previous part in the same bar) carry no attack of their own
function events() {
  const key = K(), fl = flat(), voiced = realize(fl, key);
  return timeline(state.bars).map((t) => ({ ...voiced[t.flatIndex], ...t, fn: fnOf(fl[t.flatIndex].chord, nextDistinct(fl, t.flatIndex), key) }));
}
function schedule(t0) {
  const evs = events(), bd = barDur();
  let t = t0;
  for (const e of evs) {
    const d = bd * e.frac, at = t;
    if (!e.held) playNotes(e.midi, at, bd * e.length); // sustain through any held parts that follow
    timers.push(setTimeout(() => highlight(e.flatIndex, e), Math.max(0, (at - audioTime()) * 1000)));
    t += d;
  }
  timers.push(setTimeout(() => {
    if (!playing) return;
    if ($("loop").checked) schedule(t);
    else timers.push(setTimeout(() => stop(false), 400));
  }, Math.max(0, (t - audioTime()) * 1000 - 80)));
}
function start() { ensureAudio(); playing = true; $("play").textContent = "Stop"; schedule(audioTime() + .06); }
function stop(cut = true) {
  playing = false; $("play").textContent = "Play";
  timers.forEach(clearTimeout); timers = [];
  if (cut) stopAll();
  highlight(-1);
}
function auditionPart(fi) {
  if (playing) return;
  ensureAudio();
  const e = events()[fi];
  playNotes(e.midi, audioTime() + .02, 1.3);
  highlight(fi, e);
  timers.push(setTimeout(() => { if (!playing) highlight(-1); }, 1300));
}
function auditionChord(chord, inv = 0) {
  ensureAudio();
  const [v] = realize([{ chord, inv }], K());
  playNotes(v.midi, audioTime() + .02, 1.3);
}

/* -------------------------------------------------------------- piano */
const piano = $("piano");
function buildPiano() {
  const NS = "http://www.w3.org/2000/svg", blacks = [];
  let w = 0;
  for (let m = 36; m <= 84; m++) {
    const r = document.createElementNS(NS, "rect");
    r.dataset.m = m;
    if ([1, 3, 6, 8, 10].includes(m % 12)) {
      r.setAttribute("x", w * 10 - 3); r.setAttribute("width", 6); r.setAttribute("height", 28); r.dataset.base = "b"; blacks.push(r);
    } else {
      r.setAttribute("x", w * 10); r.setAttribute("width", 10); r.setAttribute("height", 46); r.dataset.base = "w"; piano.appendChild(r); w++;
    }
    r.setAttribute("class", r.dataset.base);
  }
  blacks.forEach((b) => piano.appendChild(b));
}
function highlight(fi, e) {
  document.querySelectorAll(".cell").forEach((el) => el.classList.toggle("now", fi >= +el.dataset.from && fi <= +el.dataset.to));
  document.querySelectorAll(".beat").forEach((el) => el.classList.toggle("now", +el.dataset.flat === fi));
  [...piano.children].forEach((k) => { k.setAttribute("class", k.dataset.base); k.style.removeProperty("--fn"); });
  if (fi < 0 || !e) return;
  e.midi.forEach((m) => {
    const k = piano.querySelector(`[data-m="${m}"]`);
    if (k) { k.setAttribute("class", `${k.dataset.base} on`); k.style.setProperty("--fn", `var(--${e.fn})`); }
  });
}

/* ------------------------------------------------------------- render */
const seenBars = new Set();

function figHTML(chord, inv) {
  const f = figure(chord, inv);
  return f.length ? `<span class="fig">${f.map((x) => `<span>${x}</span>`).join("")}</span>` : "";
}

// Consecutive parts of a bar that repeat the same chord are shown once, as one cell spanning their width.
function runsOf(bar) {
  const runs = [];
  bar.parts.forEach((p, i) => {
    if (i > 0 && samePart(bar.parts[i - 1], p)) runs[runs.length - 1].push(p);
    else runs.push([p]);
  });
  return runs;
}

function cellHTML(run, fi, fl, key, m, bi, startP) {
  const part = run[0], span = run.length, inv = part.inv || 0, last = fi + span - 1;
  const next = nextDistinct(fl, fi), h = homeEntry(part.chord, key.mode);
  const fn = fnOf(part.chord, next, key);
  const rel = next ? relation(part.chord, next, key) : null;
  const odd = next && !canPrecede(part.chord, next, key);
  const tones = spell(key, part.chord), share = span / m;
  const size = share >= .75 ? "l" : share >= .5 ? "m" : share >= .33 ? "s" : "xs", small = share < .5;
  const selHere = run.some((p) => p.id === state.sel);
  const cls = ["cell", h ? (h.borrowed ? "borrowed" : "") : "chromatic", part.pin ? "pinned" : "", selHere ? "sel" : ""].filter(Boolean).join(" ");
  let meta = "";
  if (rel) meta += `<span class="rel">${small ? rel.short : rel.text}</span>`;
  if (part.pin === "end") meta += `<span>${small ? "Final" : "Final chord"}</span>`;
  else if (part.pin === "user") meta += `<span>${small ? "Yours" : "Your choice"}</span>`;
  if (odd) meta += `<span class="warn">${small ? "Uncommon" : `Uncommon before ${label(next, key.mode)}`}</span>`;
  const kind = h ? (h.borrowed ? ", borrowed" : "") : ", secondary";
  const lab = label(part.chord, key.mode, inv), sym = chordSymbol(key, part.chord, inv);
  const held = span > 1 ? `, held for ${span} parts` : "";
  const aria = `${lab}, ${sym}${held}${rel ? `, ${rel.text}` : ""}. Select to hear and change it`;
  // Beat strip: one small button per part, so a held part can still be selected and changed
  const beats = m > 1 ? `<div class="beats">${run.map((p, k) => {
    const what = k === 0 ? `plays ${lab}` : p.restrike ? `plays ${lab} again` : `holds ${lab}`;
    return `<button class="beat" data-part="${p.id}" data-flat="${fi + k}" aria-pressed="${p.id === state.sel}" title="Part ${startP + k + 1}: ${what}" aria-label="Bar ${bi + 1}, part ${startP + k + 1} of ${m}: ${what}">${startP + k + 1}${k > 0 && p.restrike ? " ↻" : ""}</button>`;
  }).join("")}</div>` : "";
  return `<div class="${cls}" style="--fn:var(--${fn});grid-column:span ${span}" data-from="${fi}" data-to="${last}" data-size="${size}">
    <button class="part" data-part="${part.id}" data-flat="${fi}" aria-pressed="${state.sel === part.id}" aria-label="${esc(aria)}">
      <span class="fn">${FN_NAME[fn]}${kind}</span>
      <span class="rn">${numeral(part.chord, key.mode)}${figHTML(part.chord, inv)}</span>
      <span class="sym">${sym}</span>
      <span class="notes">${tones.map((t) => t.name).join(" ")}</span>
      <span class="meta">${meta}</span></button>${beats}</div>`;
}

function sheetHTML(key) {
  const pad = (s, w) => s + " ".repeat(Math.max(0, w - [...s].length));
  const rows = [];
  for (let r = 0; r < state.bars.length; r += 4) {
    let s = "| ", n = "| ";
    for (const bar of state.bars.slice(r, r + 4)) {
      for (const [pi, p] of bar.parts.entries()) {
        if (pi > 0 && samePart(bar.parts[pi - 1], p)) continue; // the same chord is written once per bar
        const a = chordSymbol(key, p.chord, p.inv), b = label(p.chord, key.mode, p.inv);
        const w = Math.max([...a].length, [...b].length) + 2;
        s += pad(a, w); n += pad(b, w);
      }
      s += "| "; n += "| ";
    }
    rows.push(`<div class="line sym">${esc(s)}</div><div class="line rn">${esc(n)}</div>`);
  }
  return rows.join("");
}

function render() {
  const key = K(), fl = flat();
  const entering = state.bars.filter((b) => !seenBars.has(b.id)).map((b) => b.id);
  let fi = 0;
  $("bars").innerHTML = state.bars.map((bar, bi) => {
    const m = bar.parts.length, pos = entering.indexOf(bar.id);
    seenBars.add(bar.id);
    let startP = 0;
    const parts = runsOf(bar).map((run) => {
      const html = cellHTML(run, fi, fl, key, m, bi, startP);
      fi += run.length; startP += run.length;
      return html;
    }).join("");
    const anim = pos >= 0 ? ` enter" style="animation-delay:${(entering.length - 1 - pos) * 90}ms` : "";
    return `<section class="bar${anim}" aria-label="Bar ${bi + 1}">
      <header class="bar-head"><span class="bar-n">Bar ${bi + 1}</span>
        <div class="split" role="group" aria-label="Divide bar ${bi + 1} into equal parts"><span class="lbl">Parts</span>${[1, 2, 3, 4].map((k) =>
          `<button data-split="${bi}:${k}" aria-pressed="${k === m}" title="Divide into ${k} equal part${k > 1 ? "s" : ""}">${k}</button>`).join("")}</div>
      </header>
      <div class="parts" data-m="${m}" style="--m:${m}">${parts}</div></section>`;
  }).join("");
  $("sheet").innerHTML = sheetHTML(key);
  $("clear").hidden = !fl.some((p) => p.pin === "user");
  $("len").textContent = state.bars.length;
  renderEditor();
}

/* ------------------------------------------------------------- editor */
const editor = $("editor");
let chipChords = new Map();

function chipHTML(chord, curId, extra = {}) {
  const key = K(), id = cid(chord), h = homeEntry(chord, key.mode);
  chipChords.set(id, chord);
  const fn = h ? h.fn : chord.q === "dom7" || ["authentic", "deceptive", "tritone"].includes(extra.kind) ? "dom" : "pre";
  const cls = h ? (h.borrowed ? " borrowed" : "") : " chromatic";
  const lab = label(chord, key.mode), notes = spell(key, chord).map((t) => t.name).join(" ");
  const rel = extra.rel && extra.rel !== lab ? `<span class="c-rel">${esc(extra.rel)}</span>` : "";
  const w = extra.p != null ? `<span class="c-w">${Math.max(1, Math.round(extra.p * 100))}%</span>` : "";
  return `<button class="chip${cls}" style="--fn:var(--${fn})" data-chip="${id}" aria-pressed="${id === curId}" title="${notes}" aria-label="${esc(`${lab}${extra.rel ? ` (${extra.rel})` : ""}, ${notes}`)}">
    <span class="c-rn">${lab}</span><span class="c-sym">${chordSymbol(key, chord)}</span>${rel}${w}</button>`;
}
const kindFn = (kind) => (["authentic", "deceptive", "tritone"].includes(kind) ? kind : null);

function renderEditor() {
  const loc = state.sel != null ? locate(state.sel) : null;
  if (!loc) { state.sel = null; editor.hidden = true; return; }
  chipChords = new Map();
  const key = K(), fl = flat(), part = fl[loc.f], next = nextDistinct(fl, loc.f), cur = cid(part.chord);
  const m = state.bars[loc.b].parts.length, inv = part.inv || 0, tones = spell(key, part.chord);
  const where = `Bar ${loc.b + 1}${m > 1 ? `, part ${loc.p + 1} of ${m}` : ""}`;
  let html = `<div class="ed-head"><h2>${where}: ${label(part.chord, key.mode, inv)}<span class="sub">${chordSymbol(key, part.chord, inv)}</span></h2>
    <button class="ed-close" data-act="close" aria-label="Close">×</button></div>`;

  const prevInBar = loc.p > 0 ? state.bars[loc.b].parts[loc.p - 1] : null;
  if (samePart(prevInBar, part)) {
    html += `<p class="note">This part repeats part ${loc.p} of the bar. Pick a different chord below to change it, or choose whether it is held or played again.</p>`;
    html += `<div class="group"><h3>Playback</h3><div class="chips">
      <button class="chip" style="--fn:var(--line)" data-strike="0" aria-pressed="${!part.restrike}"><span class="c-sym">Hold from the previous part</span></button>
      <button class="chip" style="--fn:var(--line)" data-strike="1" aria-pressed="${!!part.restrike}"><span class="c-sym">Play it again here</span></button></div></div>`;
  }
  html += `<div class="group"><h3>Inversion</h3><div class="chips">${Array.from({ length: toneCount(part.chord) }, (_, k) =>
    `<button class="chip" style="--fn:var(--line)" data-inv="${k}" aria-pressed="${k === inv}"><span class="c-rn">${label(part.chord, key.mode, k)}</span><span class="c-rel">${INVERSION_NAMES[k]}, ${tones[k].name} in the bass</span></button>`).join("")}</div></div>`;

  if (next) {
    const N = label(next, key.mode), groups = cadenceGroups(next, key);
    if (part.options && part.before && cid(part.before) === cid(next)) {
      html += `<div class="group"><h3>The generator picked this from</h3><div class="chips">${part.options.slice(0, 8).map((o) =>
        chipHTML(o.chord, cur, { p: o.p, kind: kindFn(o.kind) })).join("")}</div></div>`;
    }
    html += `<div class="group"><h3>Cadences into ${N}</h3>`;
    html += groups.length
      ? `<div class="cad-rows">${groups.map((g) => `<span class="k">${esc(g.name)}</span><div class="chips">${g.items.map((it) =>
          chipHTML(it.chord, cur, { rel: it.rel, kind: g.kind })).join("")}</div>`).join("")}</div>`
      : `<p class="note">${N} is diminished, so it can't act as a temporary tonic. Pick from the weighted list below instead.</p>`;
    html += `</div><div class="group"><h3>Generator weights before ${N}</h3><div class="chips">${optionsBefore(next, key, state).slice(0, 10).map((o) =>
      chipHTML(o.chord, cur, { p: o.p, kind: kindFn(o.kind) })).join("")}</div></div>`;
  }
  const H = Object.values(HOME[key.mode]);
  html += `<div class="group"><h3>Diatonic in ${key.label}</h3><div class="chips">${H.filter((h) => !h.borrowed).map((h) => chipHTML(h.chord, cur)).join("")}</div></div>`;
  html += `<div class="group"><h3>Borrowed from ${key.parallel}</h3><div class="chips">${H.filter((h) => h.borrowed).map((h) => chipHTML(h.chord, cur)).join("")}</div></div>`;

  html += `<div class="ed-actions">`;
  const endSlot = loc.b === state.bars.length - 1 && loc.p === 0;
  if (loc.b > 0 || loc.p > 0) html += `<button class="btn quiet" data-act="rederive">Re-derive the bars before this chord</button>`;
  if (part.pin === "user" && loc.p > 0) html += `<button class="btn quiet" data-act="release">Hold the previous chord here instead</button>`;
  else if (part.pin === "user" && !endSlot && successorOf(state.bars, loc.b)) html += `<button class="btn quiet" data-act="release">Let the generator choose this one</button>`;
  if (endSlot && part.pin !== "end") html += `<button class="btn quiet" data-act="tonic">End on the tonic again</button>`;
  html += `</div>`;
  editor.innerHTML = html;
  editor.hidden = false;
}

function select(partId, play) {
  state.sel = partId;
  render();
  const loc = locate(partId);
  if (play && loc) auditionPart(loc.f);
  document.querySelector(`[data-part="${partId}"]`)?.focus({ preventScroll: true });
}

/* -------------------------------------------------------- state changes */
function generate() {
  state.bars = deriveBackward(state.bars, state.bars.length - 2, opt());
  render();
}
function rebuild() { // same bar/part structure, everything re-derived from the tonic
  state.bars = state.bars.map((b) => ({ ...b, parts: b.parts.map(() => emptyPart()) }));
  state.bars[state.bars.length - 1].parts[0] = finalPart(K().mode);
  generate();
}
function setBars(n) {
  n = Math.max(1, Math.min(16, n));
  const diff = n - state.bars.length;
  if (!diff) return;
  if (diff > 0) {
    const added = Array.from({ length: diff }, () => ({ id: newId(), parts: [emptyPart()] }));
    state.bars = deriveBackward([...added, ...state.bars], diff - 1, opt(), true); // derive only the new bars
  } else {
    state.bars = state.bars.slice(-diff);
  }
  render();
}
function setKey(v) {
  const before = K().mode;
  state.key = v;
  if (K().mode !== before) rebuild(); // the chord vocabulary differs between modes
  else render();                      // same mode: transpose and keep everything
}
function editPart(f, fnc) {
  const fl = flat();
  fl[f] = fnc(fl[f], fl);
  setFlat(fl);
}

/* ------------------------------------------------------------ download */
let downloadsP = null;
if (window.claude && typeof window.claude.use === "function") {
  downloadsP = window.claude.use("downloads");
  downloadsP.then((d) => { if (!d) $("midi").hidden = true; });
}
let statusTimer;
function setStatus(t) { $("status").textContent = t; clearTimeout(statusTimer); statusTimer = setTimeout(() => { $("status").textContent = ""; }, 6000); }

async function downloadMidi() {
  const key = K();
  const midiEvents = events().filter((e) => !e.held).map((e) => ({ midi: e.midi, ticks: Math.round(1920 * e.length) }));
  const bytes = buildMidi(midiEvents, +$("bpm").value, KEY_SIG[state.key] ?? 0, key.mode === "minor");
  const base = `backward-harmony-${state.key.replace("#", "sharp")}-${state.bars.length}-bars`;
  if (downloadsP) { // inside claude.ai, where the host only accepts certain file types
    const dl = await downloadsP;
    if (!dl) { setStatus("Downloads aren't available in this view."); return; }
    try {
      await dl.save({ filename: `${base}.zip`, data: new Blob([zipBytes(`${base}.mid`, bytes)]) });
      setStatus(`Saved ${base}.zip with the MIDI file inside.`);
    } catch (e) {
      const code = e && e.code;
      setStatus(code === "declined" ? "Download cancelled." : code === "rate_limited" ? "A save prompt is already open." : `Couldn't save the file (${code || "error"}).`);
    }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
  a.download = `${base}.mid`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  setStatus(`Saved ${base}.mid.`);
}

/* -------------------------------------------------------------- wiring */
function fillKeys() {
  const group = (title, list) => `<optgroup label="${title}">${list.map((v) =>
    `<option value="${v}"${v === state.key ? " selected" : ""}>${parseKey(v).label}</option>`).join("")}</optgroup>`;
  $("key").innerHTML = group("Major", KEY_OPTIONS.major) + group("Minor", KEY_OPTIONS.minor);
}
function slider(id, prop, out) {
  $(id).addEventListener("input", (e) => {
    state[prop] = e.target.value / 100;
    $(out).textContent = e.target.value === "0" ? "Off" : `${e.target.value}%`;
    if (state.sel != null) renderEditor();
  });
}

$("gen").onclick = () => change(generate);
$("undo").onclick = undo;
$("redo").onclick = redo;
$("play").onclick = () => (playing ? stop() : start());
$("midi").onclick = downloadMidi;
$("clear").onclick = () => change(() => {
  state.bars = state.bars.map((b) => ({ ...b, parts: b.parts.map((p) => (p.pin === "user" ? { ...p, pin: null } : p)) }));
  state.bars[state.bars.length - 1].parts[0] = finalPart(K().mode);
  generate();
});
$("less").onclick = () => change(() => setBars(state.bars.length - 1));
$("more").onclick = () => change(() => setBars(state.bars.length + 1));
$("key").onchange = (e) => change(() => setKey(e.target.value));
slider("borrow", "borrow", "borrowVal");
slider("chroma", "chroma", "chromaVal");
slider("inversions", "inversions", "invVal");
$("bpm").addEventListener("input", (e) => { $("bpmVal").textContent = e.target.value; });

$("bars").addEventListener("click", (e) => {
  const sp = e.target.closest("[data-split]");
  if (sp) {
    const [bi, k] = sp.dataset.split.split(":").map(Number);
    change(() => { state.bars[bi] = splitBar(state.bars[bi], k); render(); });
    return;
  }
  const pt = e.target.closest("[data-part]");
  if (pt) select(+pt.dataset.part, true);
});

editor.addEventListener("click", (e) => change(() => editorClick(e)));
function editorClick(e) {
  const loc = state.sel != null ? locate(state.sel) : null;
  if (!loc) return;
  const chipEl = e.target.closest("[data-chip]"), invEl = e.target.closest("[data-inv]"), strikeEl = e.target.closest("[data-strike]");
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (strikeEl) {
    const v = strikeEl.dataset.strike === "1";
    editPart(loc.f, (p) => ({ ...p, restrike: v }));
    render();
    editor.querySelector(`[data-strike="${v ? 1 : 0}"]`)?.focus();
  } else if (chipEl) {
    const chord = chipChords.get(chipEl.dataset.chip);
    editPart(loc.f, (p) => ({ id: p.id, chord, inv: 0, pin: "user" }));
    auditionChord(chord);
    render();
    editor.querySelector(`[data-chip="${chipEl.dataset.chip}"]`)?.focus();
  } else if (invEl) {
    const k = +invEl.dataset.inv;
    editPart(loc.f, (p) => ({ ...p, inv: k, pin: p.pin || "user", copied: false }));
    auditionChord(flat()[loc.f].chord, k);
    render();
    editor.querySelector(`[data-inv="${k}"]`)?.focus();
  } else if (act === "close") {
    state.sel = null; render();
  } else if (act === "rederive") {
    state.bars = deriveBackward(state.bars, loc.p > 0 ? loc.b : loc.b - 1, opt()); render();
  } else if (act === "release" && loc.p > 0) {
    editPart(loc.f, (p) => ({ id: p.id, chord: p.chord, inv: p.inv, pin: null })); // becomes a held repeat again
    render();
  } else if (act === "release") {
    state.bars = deriveBar(state.bars, loc.b, opt());
    state.sel = state.bars[loc.b].parts[0].id; render();
  } else if (act === "tonic") {
    editPart(loc.f, (p) => ({ ...finalPart(K().mode), id: p.id }));
    render();
  }
}

document.addEventListener("keydown", (e) => {
  if (e.target.matches("select, input")) return;
  if (e.key === "Escape" && state.sel != null) { state.sel = null; render(); }
  else if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); }
  else if ((e.key === "g" || e.key === "G") && !e.metaKey && !e.ctrlKey && !e.altKey) change(generate);
  else if (e.code === "Space" && !e.target.matches("button")) { e.preventDefault(); playing ? stop() : start(); }
  else if (state.sel != null && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.target.closest(".editor")) {
    e.preventDefault();
    const fl = flat(), loc = locate(state.sel);
    const f = Math.max(0, Math.min(fl.length - 1, loc.f + (e.key === "ArrowLeft" ? -1 : 1)));
    select(fl[f].id, true);
  }
});

fillKeys();
buildPiano();
updateHistory();
state.bars = freshBars(4, opt());
render();
