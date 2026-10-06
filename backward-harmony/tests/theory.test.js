import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseKey, KEY_OPTIONS, HOME, RULES, mk, cid, spell, label, chordSymbol, numeral,
  cadenceGroups, relation, optionsBefore, canPrecede,
} from "../src/theory.js";
import { deriveBackward, freshBars, flatten, splitBar, syncBars, timeline } from "../src/generator.js";
import { realize } from "../src/voicing.js";
import { buildMidi, zipBytes, crc32 } from "../src/midi.js";

const C = parseKey("C"), Am = parseKey("Am");
const names = (key, c) => spell(key, c).map((t) => t.name).join(" ");
const H = (mode, lab) => HOME[mode][lab].chord;
const ALL_KEYS = [...KEY_OPTIONS.major, ...KEY_OPTIONS.minor];

test("every rule refers to a chord the key actually has", () => {
  for (const mode of ["major", "minor"]) {
    for (const [lab, r] of Object.entries(RULES[mode])) {
      assert.ok(HOME[mode][lab], `${mode} ${lab} has no definition`);
      for (const [s] of [...r.d, ...r.b]) assert.ok(HOME[mode][s], `${mode} ${lab} -> unknown ${s}`);
      assert.ok(r.d.length > 0, `${mode} ${lab} needs at least one diatonic predecessor`);
    }
    for (const lab of Object.keys(HOME[mode])) assert.ok(RULES[mode][lab], `${mode} ${lab} has no rules`);
  }
});

test("chords are spelled by letter, not by sound", () => {
  assert.equal(names(C, mk(5, 9, "maj")), "A C♯ E");            // V/ii in C, labelled VI
  assert.equal(label(mk(5, 9, "maj"), "major"), "VI");
  assert.equal(names(parseKey("Gm"), H("minor", "V")), "D F♯ A");
  assert.equal(names(C, mk(1, 1, "dom7")), "D♭ F A♭ C♭");       // tritone sub of G7
  assert.equal(names(C, H("major", "♭VI")), "A♭ C E♭");
  assert.equal(names(parseKey("Db"), H("major", "♭VI")), "B♭♭ D♭ F♭");
});

test("inversions show figures and slash chords", () => {
  const V7 = mk(4, 7, "dom7");
  assert.equal(label(V7, "major", 0), "V7");
  assert.equal(label(V7, "major", 1), "V⁶₅");
  assert.equal(label(V7, "major", 3), "V⁴₂");
  assert.equal(label(H("major", "I"), "major", 2), "I⁶₄");
  assert.equal(chordSymbol(C, V7, 1), "G7/B");
  assert.equal(chordSymbol(C, H("major", "ii"), 1), "Dm/F");
});

test("cadences into a chord treat it as a temporary tonic", () => {
  const ii = H("major", "ii");
  const groups = Object.fromEntries(cadenceGroups(ii, C).map((g) => [g.kind, g.items.map((i) => numeral(i.chord, "major"))]));
  assert.deepEqual(groups.authentic, ["VI", "VI", "♯i°"]);    // A, A7, C♯°
  assert.deepEqual(groups.tritone, ["♭III"]);                 // E♭7
  assert.deepEqual(groups.plagal, ["v"]);                     // Gm (iv of ii)
  assert.equal(cadenceGroups(H("major", "vii°"), C).length, 0);
});

test("cadence relations are recognised", () => {
  const I = H("major", "I"), V = H("major", "V"), IV = H("major", "IV"), vi = H("major", "vi");
  assert.equal(relation(V, I, C).kind, "authentic");
  assert.equal(relation(mk(4, 7, "dom7"), I, C).kind, "authentic");
  assert.equal(relation(mk(1, 1, "dom7"), I, C).kind, "tritone");
  assert.equal(relation(IV, I, C).kind, "plagal");
  assert.equal(relation(V, vi, C).kind, "deceptive");
  assert.equal(relation(I, V, C).kind, "half");
  assert.equal(relation(mk(5, 9, "maj"), H("major", "ii"), C).text, "Authentic into ii");
  assert.equal(relation(H("minor", "V"), H("minor", "VI"), Am).kind, "deceptive");
});

test("option weights are probabilities and respect the sliders", () => {
  for (const key of [C, Am]) {
    for (const h of Object.values(HOME[key.mode])) {
      const o = optionsBefore(h.chord, key, { borrow: .5, chroma: .5 });
      assert.ok(Math.abs(o.reduce((s, x) => s + x.p, 0) - 1) < 1e-9);
    }
  }
  const off = optionsBefore(H("major", "I"), C, { borrow: 0, chroma: 0 });
  assert.ok(off.every((o) => !HOME.major[numeral(o.chord, "major")]?.borrowed));
  assert.ok(!off.some((o) => cid(o.chord) === cid(mk(1, 1, "dom7"))));
  assert.ok(canPrecede(mk(4, 7, "dom7"), H("major", "I"), C));
});

test("only the first chord of each bar is generated; later parts hold it", () => {
  for (let t = 0; t < 600; t++) {
    const key = parseKey(ALL_KEYS[t % ALL_KEYS.length]);
    const opt = { key, borrow: (t % 5) / 4, chroma: (t % 4) / 3, inversions: (t % 3) / 2 };
    let bars = freshBars(1 + (t % 16), opt);
    bars = bars.map((b, i) => splitBar(b, 1 + ((i + t) % 4)));
    bars = deriveBackward(bars, bars.length - 2, opt);
    const last = bars[bars.length - 1].parts[0];
    assert.equal(last.pin, "end");
    assert.equal(cid(last.chord), cid(HOME[key.mode][key.mode === "major" ? "I" : "i"].chord));
    for (const bar of bars) {
      bar.parts.slice(1).forEach((p, i) => {
        assert.equal(cid(p.chord), cid(bar.parts[i].chord), "later parts repeat the part before them");
        assert.ok(!p.options, "later parts are never generated");
      });
    }
    // every follower is held, so each bar makes exactly one sound
    assert.equal(timeline(bars).filter((e) => !e.held).length, bars.length);
    for (const v of realize(flatten(bars), key)) {
      assert.equal(v.midi.length, 4);
      assert.ok(v.midi.every((m) => Number.isInteger(m) && m >= 36 && m <= 84));
      assert.ok(v.tones.every((x) => !x.name.includes("undefined")));
      assert.equal(v.midi[0] % 12, v.tones[v.inv].pc, "bass matches the inversion");
    }
  }
});

test("a chord you pick later in a bar becomes what the bar's first chord leads into", () => {
  const opt = { key: C, borrow: 0, chroma: 0, inversions: 0, rnd: () => 0 };
  let bars = freshBars(2, opt).map((b) => splitBar(b, 2));
  const ii = H("major", "ii");
  bars[0].parts[1] = { id: 999, chord: ii, inv: 0, pin: "user" };
  bars = deriveBackward(syncBars(bars), 0, opt);
  assert.equal(cid(bars[0].parts[1].chord), cid(ii));
  assert.equal(cid(bars[0].parts[0].before), cid(ii));                     // derived from ii, not from bar 2
  assert.ok(cadenceGroups(ii, C).length && bars[0].parts[0].options.some((o) => cid(o.chord) === cid(bars[0].parts[0].chord)));
});

test("splitting adds held copies after the bar's chord; merging keeps the first parts", () => {
  const bar = { id: 1, parts: [{ id: 10, chord: H("major", "I"), inv: 1, pin: "end" }] };
  const four = splitBar(bar, 4);
  assert.equal(four.parts.length, 4);
  assert.equal(four.parts[0].id, 10);
  assert.ok(four.parts.slice(1).every((p) => cid(p.chord) === cid(bar.parts[0].chord) && p.inv === 1 && !p.pin));
  assert.deepEqual(timeline([four]).map((e) => e.held), [false, true, true, true]);
  assert.equal(splitBar(four, 2).parts[0].id, 10);
});

test("MIDI and ZIP output are well formed", () => {
  const bytes = buildMidi([{ midi: [48, 60, 64, 67], ticks: 1920 }, { midi: [43, 59, 62, 67], ticks: 640 }], 90, 0, false);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "MThd");
  assert.equal(String.fromCharCode(...bytes.slice(14, 18)), "MTrk");
  const len = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
  assert.equal(len, bytes.length - 22);
  assert.deepEqual([...bytes.slice(-3)], [0xff, 0x2f, 0x00]);
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const zip = zipBytes("a.mid", bytes);
  assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50);
});

test("repeated parts in a bar are held unless marked to play again", async () => {
  const { timeline } = await import("../src/generator.js");
  const I = H("major", "I"), V = H("major", "V");
  const P = (chord, extra = {}) => ({ id: Math.random(), chord, inv: 0, ...extra });
  const bars = [
    { id: 1, parts: [P(I), P(I), P(V), P(V, { restrike: true })] },
    { id: 2, parts: [P(V), P(V, { inv: 1 }), P(V, { inv: 1 })] },
    { id: 3, parts: [P(I)] },
  ];
  const t = timeline(bars);
  assert.deepEqual(t.map((e) => e.held), [false, true, false, false, false, false, true, false]);
  assert.equal(t[0].length, .5);                       // I held through part 2
  assert.equal(t[2].length, .25);                      // V then re-struck
  assert.ok(Math.abs(t[5].length - 2 / 3) < 1e-9);     // V⁶ held across two thirds
  assert.equal(t[4].held, false);                      // first part of a bar always plays, even after the same chord
  const total = t.filter((e) => !e.held).reduce((s, e) => s + e.length, 0);
  assert.ok(Math.abs(total - bars.length) < 1e-9);     // timing is preserved
});
