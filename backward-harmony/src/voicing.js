// Turn parts into concrete notes: the bass takes the inversion's bass tone and moves as little as
// possible; three upper voices sit in close position and also move as little as possible.
import { spell } from "./theory.js";

export function realize(flat, key) {
  let prevUp = [60, 64, 67], prevBass = 45;
  return flat.map((part) => {
    const tones = spell(key, part.chord);
    const inv = Math.min(part.inv || 0, tones.length - 1);

    let bass = null, bestBass = Infinity;
    for (let m = 38; m <= 52; m++) {
      if (m % 12 === tones[inv].pc && Math.abs(m - prevBass) < bestBass) { bestBass = Math.abs(m - prevBass); bass = m; }
    }

    // Sevenths keep root, 3rd and 7th up top (the 5th is the usual note to leave out)
    const upPcs = tones.length === 4 ? [tones[0].pc, tones[1].pc, tones[3].pc] : tones.map((t) => t.pc);
    const cands = upPcs.map((pc) => { const a = []; for (let m = 54; m <= 79; m++) if (m % 12 === pc) a.push(m); return a; });
    let best = null, bestCost = Infinity;
    for (const a of cands[0]) for (const b of cands[1]) for (const c of cands[2]) {
      const v = [a, b, c].sort((x, y) => x - y);
      if (v[2] - v[0] > 12) continue;
      const cost = v.reduce((t, n, j) => t + Math.abs(n - prevUp[j]), 0);
      if (cost < bestCost) { bestCost = cost; best = v; }
    }
    prevUp = best; prevBass = bass;
    return { part, tones, inv, midi: [bass, ...best] };
  });
}
