// Music theory core: chord representation, spelling, Roman numerals,
// rule weights, and the cadences that can lead into any chord.
//
// A chord is {deg, off, q}:
//   deg  letter degree above the tonic (0-6), used for correct spelling
//   off  semitones above the tonic (0-11)
//   q    quality: "maj" | "min" | "dim" | "dom7"
// Labels are chromatic Roman numerals, so V of ii in C major (A C♯ E) reads VI.

const mod = (a, n) => ((a % n) + n) % n;

export const LETTERS = "CDEFGAB";
export const NAT = [0, 2, 4, 5, 7, 9, 11];
const MAJ_REF = [0, 2, 4, 5, 7, 9, 11];
const MIN_REF = [0, 2, 3, 5, 7, 8, 10];
const NUM = ["I", "II", "III", "IV", "V", "VI", "VII"];
export const QUAL = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], dom7: [0, 4, 7, 10] };
const ACC = { "-3": "♭♭♭", "-2": "♭♭", "-1": "♭", "0": "", "1": "♯", "2": "♯♯", "3": "♯♯♯" };
const SUP = { 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷" };
const SUB = { 2: "₂", 3: "₃", 4: "₄", 5: "₅" };

export const KEY_OPTIONS = {
  major: ["C", "G", "D", "A", "E", "B", "F", "Bb", "Eb", "Ab", "Db"],
  minor: ["Am", "Em", "Bm", "F#m", "C#m", "Dm", "Gm", "Cm", "Fm"],
};
export const KEY_SIG = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5,
  Am: 0, Em: 1, Bm: 2, "F#m": 3, "C#m": 4, Dm: -1, Gm: -2, Cm: -3, Fm: -4 };
export const FN_NAME = { tonic: "Tonic", pre: "Predominant", dom: "Dominant" };

export const mk = (deg, off, q) => ({ deg: mod(deg, 7), off: mod(off, 12), q });
export const cid = (c) => `${c.deg}:${c.off}:${c.q}`;
export const triadOf = (c) => (c.q === "dom7" ? mk(c.deg, c.off, "maj") : c);
export const toneCount = (c) => QUAL[c.q].length;

/* ---------------------------------------------------------------- keys */

export function parseKey(v) {
  const m = /^([A-G])([#b]?)(m?)$/.exec(v);
  if (!m) throw new Error(`Unrecognized key "${v}"`);
  const li = LETTERS.indexOf(m[1]);
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const mode = m[3] ? "minor" : "major";
  const tonicName = m[1] + ACC[acc];
  return {
    li, pc: mod(NAT[li] + acc, 12), mode, raw: v, tonicName,
    label: `${tonicName} ${mode}`,
    parallel: `${tonicName} ${mode === "major" ? "minor" : "major"}`,
  };
}

/* ------------------------------------------------------- names, labels */

export function numeral(c, mode) {
  let n = NUM[c.deg];
  if (c.q === "min" || c.q === "dim") n = n.toLowerCase();
  if (c.q === "dim") n += "°";
  let d = mod(c.off - (mode === "major" ? MAJ_REF : MIN_REF)[c.deg] + 6, 12) - 6;
  if (mode === "minor" && c.deg === 6 && c.off === 11 && c.q === "dim") d = 0; // minor-key vii° needs no ♯
  return (d < 0 ? "♭".repeat(-d) : "♯".repeat(d)) + n;
}

// Figured-bass figures for an inversion: [] (root triad), ["6"], ["6","4"], ["7"], ["6","5"], ["4","3"], ["4","2"]
export function figure(c, inv = 0) {
  return c.q === "dom7" ? [["7"], ["6", "5"], ["4", "3"], ["4", "2"]][inv] : [[], ["6"], ["6", "4"]][inv];
}
export function figureText(c, inv = 0) {
  const f = figure(c, inv);
  if (!f.length) return "";
  if (f.length === 1) return f[0] === "7" ? "7" : SUP[f[0]];
  return SUP[f[0]] + SUB[f[1]];
}
export const label = (c, mode, inv = 0) => numeral(c, mode) + figureText(c, inv);
export const INVERSION_NAMES = ["Root position", "1st inversion", "2nd inversion", "3rd inversion"];

// Letters stack in thirds from the chord's degree, so every chord is spelled correctly:
// A major in C is A C♯ E; G minor's V is D F♯ A; the tritone sub of G7 in C is D♭ F A♭ C♭.
export function spell(key, c) {
  const root = mod(key.pc + c.off, 12);
  return QUAL[c.q].map((iv, k) => {
    const li = (key.li + c.deg + 2 * k) % 7;
    const pc = (root + iv) % 12;
    return { name: LETTERS[li] + ACC[mod(pc - NAT[li] + 6, 12) - 6], pc };
  });
}

// Lead-sheet symbol, e.g. "G7/B", "Dm", "Bdim", "A♭"
export function chordSymbol(key, c, inv = 0) {
  const t = spell(key, c);
  const suffix = { maj: "", min: "m", dim: "dim", dom7: "7" }[c.q];
  return t[0].name + suffix + (inv ? `/${t[inv].name}` : "");
}

/* ------------------------------------------------------ the key's chords */

// [degree, semitones, quality, function, borrowed from the parallel key]
const HOME_LIST = {
  major: [[0, 0, "maj", "tonic"], [1, 2, "min", "pre"], [2, 4, "min", "tonic"], [3, 5, "maj", "pre"],
    [4, 7, "maj", "dom"], [5, 9, "min", "tonic"], [6, 11, "dim", "dom"],
    [3, 5, "min", "pre", 1], [2, 3, "maj", "tonic", 1], [5, 8, "maj", "pre", 1], [6, 10, "maj", "dom", 1], [1, 2, "dim", "pre", 1]],
  minor: [[0, 0, "min", "tonic"], [1, 2, "dim", "pre"], [2, 3, "maj", "tonic"], [3, 5, "min", "pre"],
    [4, 7, "maj", "dom"], [5, 8, "maj", "tonic"], [6, 10, "maj", "dom"], [6, 11, "dim", "dom"],
    [0, 0, "maj", "tonic", 1], [3, 5, "maj", "pre", 1], [1, 2, "min", "pre", 1]],
};
export const HOME = {};
for (const mode of ["major", "minor"]) {
  HOME[mode] = {};
  for (const [deg, off, q, fn, b] of HOME_LIST[mode]) {
    const chord = mk(deg, off, q);
    HOME[mode][numeral(chord, mode)] = { chord, fn, borrowed: !!b };
  }
}
// The key's own entry for a chord (a dominant seventh counts as its triad), or null for secondary chords
export function homeEntry(c, mode) {
  const t = triadOf(c);
  const h = HOME[mode][numeral(t, mode)];
  return h && cid(h.chord) === cid(t) ? h : null;
}
export const tonicChord = (mode) => mk(0, 0, mode === "major" ? "maj" : "min");
export const isHomeTonic = (c, mode) => cid(c) === cid(tonicChord(mode));

/* --------------------------------------------------------- rule weights */
// X -> chords that commonly come BEFORE X. d = diatonic, b = borrowed (scaled by the Borrowed slider).
export const RULES = {
  major: {
    "I":    { d: [["IV", .4], ["V", .4], ["vi", .2], ["vii°", .1]], b: [["iv", .25], ["♭VII", .2], ["♭VI", .1]] },
    "ii":   { d: [["V", .5], ["vi", .3], ["I", .2]], b: [["♭VI", .2]] },
    "iii":  { d: [["I", .5], ["vi", .3], ["IV", .2]], b: [] },
    "IV":   { d: [["I", .5], ["ii", .3], ["V", .2], ["iii", .1]], b: [["♭VII", .15]] },
    "V":    { d: [["I", .3], ["ii", .4], ["IV", .3], ["vi", .1]], b: [["♭VI", .25], ["iv", .2], ["ii°", .15]] },
    "vi":   { d: [["ii", .4], ["IV", .4], ["V", .2], ["iii", .15]], b: [] },
    "vii°": { d: [["IV", .4], ["ii", .4], ["I", .2]], b: [] },
    "iv":   { d: [["IV", .35], ["I", .35], ["ii", .1]], b: [["♭VI", .2]] },
    "♭III": { d: [["I", .5]], b: [["♭VII", .3], ["♭VI", .2]] },
    "♭VI":  { d: [["I", .4]], b: [["♭III", .3], ["iv", .15], ["♭VII", .15]] },
    "♭VII": { d: [["IV", .3], ["I", .3]], b: [["♭VI", .4]] },
    "ii°":  { d: [["I", .3]], b: [["♭VI", .5], ["iv", .2]] },
  },
  minor: {
    "i":    { d: [["iv", .4], ["V", .4], ["VI", .2], ["VII", .1], ["vii°", .1]], b: [] },
    "ii°":  { d: [["V", .5], ["VI", .3], ["i", .2]], b: [] },
    "III":  { d: [["VII", .5], ["i", .3], ["VI", .2]], b: [] },
    "iv":   { d: [["i", .5], ["ii°", .3], ["V", .2]], b: [["I", .15]] },
    "V":    { d: [["i", .3], ["ii°", .4], ["iv", .3], ["VI", .1]], b: [["IV", .25], ["ii", .15]] },
    "VI":   { d: [["ii°", .4], ["iv", .4], ["V", .2], ["III", .2]], b: [] },
    "VII":  { d: [["VI", .4], ["i", .3], ["iv", .3]], b: [] },
    "vii°": { d: [["iv", .4], ["ii°", .3], ["i", .3]], b: [] },
    "I":    { d: [["V", .7], ["iv", .2], ["vii°", .1]], b: [] },
    "IV":   { d: [["i", .5], ["III", .2]], b: [["ii", .3]] },
    "ii":   { d: [["i", .4], ["VI", .3]], b: [["IV", .3]] },
  },
};

/* ----------------------------------------------- cadences into any chord */

// Respell a chord whose root would need a double sharp or flat (D♯♯ -> E) so chains of secondary chords stay readable.
export function fix(c, key) {
  for (let guard = 0; guard < 3; guard++) {
    const li = (key.li + c.deg) % 7;
    const a = mod(key.pc + c.off - NAT[li] + 6, 12) - 6;
    if (Math.abs(a) < 2) break;
    c = mk(c.deg + Math.sign(a), c.off, c.q);
  }
  return c;
}

// Treat target X as a temporary tonic and list the chords that form each cadence type into it.
// Diminished chords can't be tonicized, so they get none.
export function cadenceGroups(target, key) {
  const X = triadOf(target);
  if (X.q === "dim") return [];
  const mode = key.mode, L = numeral(X, mode), home = isHomeTonic(X, mode);
  const of = (p) => (home ? p : `${p}/${L}`);
  const f = (d, o, q) => fix(mk(X.deg + d, X.off + o, q), key);
  const groups = [
    { kind: "authentic", name: "Authentic", items: [
      { chord: f(4, 7, "maj"), w: .25, rel: of("V") },
      { chord: f(4, 7, "dom7"), w: .15, rel: of("V7") },
      { chord: f(6, 11, "dim"), w: .07, rel: of("vii°") }] },
    // Tritone substitution: the dominant seventh a tritone away from V7 shares its tritone and resolves down a half step
    { kind: "tritone", name: "Tritone substitute", items: [
      { chord: f(1, 1, "dom7"), w: .06, rel: of("subV7") }] },
    { kind: "plagal", name: "Plagal", items: [
      { chord: f(3, 5, X.q), w: .12, rel: of(X.q === "maj" ? "IV" : "iv") }] },
  ];
  // Deceptive: X plays the role of vi (minor X) or VI (major X) in some key; approach from that key's V
  const T = X.q === "min" ? f(2, 3, "maj") : f(2, 4, "min");
  groups.push({ kind: "deceptive", name: "Deceptive", items: [
    { chord: f(6, X.q === "min" ? 10 : 11, "maj"), w: .05, rel: isHomeTonic(T, mode) ? "V" : `V/${numeral(T, mode)}` }] });
  // Half: a major X acts as V of the key a fifth below; approach from that key's I, ii or IV
  if (X.q === "maj") {
    const H = f(3, 5, "maj"), nm = spell(key, H)[0].name;
    groups.push({ kind: "half", name: `Half (${L} as V of ${nm})`, items: [
      { chord: H, w: .08, rel: `I in ${nm}` },
      { chord: f(4, 7, "min"), w: .06, rel: `ii in ${nm}` },
      { chord: f(6, 10, "maj"), w: .04, rel: `IV in ${nm}` }] });
  }
  return groups;
}

const REL_TEXT = {
  authentic: ["Authentic into", "Auth."], tritone: ["Tritone sub into", "Tritone"],
  plagal: ["Plagal into", "Plagal"], deceptive: ["Deceptive into", "Decept."], half: ["Half cadence on", "Half"],
};
// Which cadence (if any) does a -> b form? Checked in a fixed order of precedence.
export function relation(a, b, key) {
  const groups = cadenceGroups(b, key), id = cid(a);
  const order = isHomeTonic(triadOf(b), key.mode)
    ? ["authentic", "tritone", "plagal", "deceptive"]
    : ["authentic", "tritone", "deceptive", "half", "plagal"];
  for (const kind of order) {
    const g = groups.find((x) => x.kind === kind);
    if (g && g.items.some((it) => cid(it.chord) === id)) {
      return { kind, text: `${REL_TEXT[kind][0]} ${label(b, key.mode)}`, short: REL_TEXT[kind][1] };
    }
  }
  return null;
}

export function fnOf(c, next, key) {
  const h = homeEntry(c, key.mode);
  if (h) return h.fn;
  if (c.q === "dom7") return "dom";
  const r = next ? relation(c, next, key) : null;
  return r && ["authentic", "deceptive", "tritone"].includes(r.kind) ? "dom" : "pre";
}

const pcsRel = (c) => QUAL[c.q].map((iv) => (c.off + iv) % 12);

// Every chord that may come before X with its probability. Merges (a) the rule table for the key's own
// chords, or a common-tone route back into the key for secondary chords, with (b) all cadences into X.
export function optionsBefore(X, key, { borrow = .25, chroma = .3 } = {}) {
  const mode = key.mode, H = HOME[mode], m = new Map();
  const add = (chord, w, rel = null, kind = null) => {
    if (w <= 0) return;
    const id = cid(chord), cur = m.get(id);
    if (!cur) m.set(id, { chord, w, rel, kind });
    else {
      cur.w = Math.max(cur.w, w);
      if (!cur.rel && rel) { cur.rel = rel; cur.kind = kind; }
    }
  };
  const h = homeEntry(X, mode);
  const r = h && RULES[mode][numeral(h.chord, mode)];
  if (r) {
    r.d.forEach(([s, w]) => add(H[s].chord, w));
    r.b.forEach(([s, w]) => add(H[s].chord, w * borrow));
  } else {
    const xs = new Set(pcsRel(X));
    Object.values(H).filter((e) => !e.borrowed)
      .forEach((e) => add(e.chord, .15 * pcsRel(e.chord).filter((p) => xs.has(p)).length));
  }
  for (const g of cadenceGroups(X, key)) {
    for (const it of g.items) {
      const e = homeEntry(it.chord, mode);
      const scale = g.kind === "tritone" || !e ? chroma : e.borrowed ? borrow : 1;
      add(it.chord, it.w * scale, it.rel, g.kind);
    }
  }
  const all = [...m.values()], total = all.reduce((s, o) => s + o.w, 0);
  return all.map((o) => ({ ...o, p: o.w / total })).sort((a, b) => b.p - a.p);
}

// Is a -> b covered by the rules or a cadence (ignoring the sliders)? A seventh counts as its triad.
export function canPrecede(a, b, key) {
  const ids = new Set(optionsBefore(b, key, { borrow: 1, chroma: 1 }).map((o) => cid(o.chord)));
  return ids.has(cid(a)) || ids.has(cid(triadOf(a)));
}
