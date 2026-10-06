// Backward derivation. The progression is a list of bars; each bar holds 1-4 equal parts.
// Derivation runs over the flattened list of parts, from the end toward the start:
// each part is chosen from the weighted options for the part that follows it.
import { optionsBefore, isHomeTonic, triadOf, tonicChord, cid } from "./theory.js";

let idCounter = 0;
export const newId = () => ++idCounter;

export function weightedPick(opts, rnd = Math.random) {
  let r = rnd();
  for (const o of opts) { if ((r -= o.p) <= 0) return o; }
  return opts[opts.length - 1];
}

// Choose an inversion. `amount` (0-1) is how often to leave root position.
// Diminished triads lean toward first inversion; a tonic triad before V may become a cadential 6/4.
export function pickInversion(chord, next, key, amount, rnd = Math.random) {
  if (amount <= 0) return 0;
  const p = chord.q === "dim" ? Math.min(1, amount * 2) : amount;
  if (rnd() >= p) return 0;
  if (chord.q === "dom7") { const r = rnd(); return r < .45 ? 1 : r < .65 ? 2 : 3; }
  const n = next && triadOf(next);
  const cadential64 = isHomeTonic(chord, key.mode) && n && n.deg === 4 && n.off === 7 && n.q === "maj";
  return rnd() < (cadential64 ? .6 : .2) ? 2 : 1;
}

// The generator only writes the FIRST chord of each bar. Every later part of a bar is either a chord
// the user picked (pinned) or a "follower" that repeats the part before it, which playback holds.

// opt: {key, borrow, chroma, inversions, rnd}
export function deriveFrom(next, opt) {
  const options = optionsBefore(next, opt.key, opt);
  const pick = weightedPick(options, opt.rnd);
  return {
    id: newId(), chord: pick.chord, pin: null, options, before: next,
    inv: pickInversion(pick.chord, next, opt.key, opt.inversions, opt.rnd),
  };
}

// The chord that bar b's first chord leads into: the first chord the user pinned later in the same bar,
// otherwise the first chord of the next bar.
export function successorOf(bars, b) {
  const later = bars[b].parts.slice(1).find((p) => p.pin && p.chord);
  return later ? later.chord : bars[b + 1]?.parts[0].chord ?? null;
}

// Make every unpinned later part repeat the part before it (keeping any "play it again" flag).
export function syncBar(bar) {
  const parts = [bar.parts[0]];
  for (let i = 1; i < bar.parts.length; i++) {
    const p = bar.parts[i], prev = parts[i - 1];
    parts.push(p.pin ? p : { id: p.id, chord: prev.chord, inv: prev.inv || 0, pin: null, copied: true, restrike: !!p.restrike });
  }
  return { ...bar, parts };
}
export const syncBars = (bars) => bars.map(syncBar);

// Re-derive one bar's first chord from its successor.
export function deriveBar(bars, b, opt) {
  const next = successorOf(bars, b);
  if (!next) return bars;
  const out = bars.slice();
  out[b] = syncBar({ ...bars[b], parts: [deriveFrom(next, opt), ...bars[b].parts.slice(1)] });
  return out;
}

// Recursive core: fill bar b's first chord from what follows it, then step one bar to the left.
// Pinned first chords (the final tonic, or anything the user chose) are kept as they are.
export function deriveBackward(bars, b, opt, onlyEmpty = false) {
  if (b < 0) return syncBars(bars);
  const first = bars[b].parts[0];
  const next = !first.pin && !(onlyEmpty && first.chord) ? deriveBar(bars, b, opt) : bars;
  return deriveBackward(next, b - 1, opt, onlyEmpty);
}

export const emptyPart = () => ({ id: newId(), chord: null, inv: 0, pin: null });
export const finalPart = (mode) => ({ id: newId(), chord: tonicChord(mode), inv: 0, pin: "end" });
export const flatten = (bars) => bars.flatMap((b) => b.parts);
export function regroup(bars, flat) {
  let k = 0;
  return bars.map((b) => ({ ...b, parts: flat.slice(k, (k += b.parts.length)) }));
}

// A fresh progression of `count` bars ending on the tonic (the final bar's first chord).
export function freshBars(count, opt) {
  const bars = Array.from({ length: count }, () => ({ id: newId(), parts: [emptyPart()] }));
  bars[count - 1].parts = [finalPart(opt.key.mode)];
  return deriveBackward(bars, count - 2, opt);
}

// Divide a bar into m equal parts (1-4). New parts are added after the existing ones and repeat
// the last chord, so they are held until you change them. Merging keeps the first m parts.
export function splitBar(bar, m) {
  m = Math.max(1, Math.min(4, m));
  const k = bar.parts.length;
  if (m === k) return bar;
  if (m < k) return { ...bar, parts: bar.parts.slice(0, m) };
  return syncBar({ ...bar, parts: [...bar.parts, ...Array.from({ length: m - k }, () => ({ id: newId(), pin: null }))] });
}

// Same chord in the same inversion?
export const samePart = (a, b) => !!a && !!b && !!a.chord && !!b.chord && cid(a.chord) === cid(b.chord) && (a.inv || 0) === (b.inv || 0);

// Playback timeline. Within a bar, a part that repeats the part before it is held, not played again,
// unless it is marked restrike. The first part of every bar is always played.
// Each entry: {flatIndex, frac (share of its bar), held, length (bar share the attack sounds for; 0 if held), head}
export function timeline(bars) {
  const out = [];
  let f = 0;
  for (const bar of bars) {
    const m = bar.parts.length;
    let head = null;
    bar.parts.forEach((p, i) => {
      const held = i > 0 && !p.restrike && samePart(bar.parts[i - 1], p);
      const e = { flatIndex: f++, frac: 1 / m, held, length: held ? 0 : 1 / m, head: held ? head.flatIndex : null };
      if (held) head.length += 1 / m; else head = e;
      out.push(e);
    });
  }
  return out;
}
