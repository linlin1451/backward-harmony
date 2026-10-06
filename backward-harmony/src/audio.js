// Small Web Audio synth: triangle + sine partial per note, a gentle envelope and a generated room.
let actx = null, master = null, liveVoices = [];

export function ensureAudio() {
  if (actx) { actx.resume(); return actx; }
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = actx.createDynamicsCompressor(); comp.connect(actx.destination);
  const lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200; lp.connect(comp);
  master = actx.createGain(); master.gain.value = .55; master.connect(lp);
  const verb = actx.createConvolver(), n = Math.floor(actx.sampleRate * 2.2), ir = actx.createBuffer(2, n, actx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
  verb.buffer = ir;
  const wet = actx.createGain(); wet.gain.value = .22;
  master.connect(verb); verb.connect(wet); wet.connect(comp);
  return actx;
}
export const audioTime = () => (actx ? actx.currentTime : 0);

function voice(midi, t, dur, level) {
  const f = 440 * Math.pow(2, (midi - 69) / 12), g = actx.createGain(); g.connect(master);
  const o1 = actx.createOscillator(); o1.type = "triangle"; o1.frequency.value = f; o1.connect(g);
  const o2 = actx.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2;
  const g2 = actx.createGain(); g2.gain.value = .12; o2.connect(g2); g2.connect(g);
  const rel = Math.min(.09, dur * .15);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + .015);
  g.gain.exponentialRampToValueAtTime(level * .45, t + Math.min(.5, dur * .8));
  g.gain.setTargetAtTime(0, t + dur * .92, rel);
  o1.start(t); o2.start(t); o1.stop(t + dur + .6); o2.stop(t + dur + .6);
  const v = { g, o1, o2 }; liveVoices.push(v);
  o1.onended = () => { liveVoices = liveVoices.filter((x) => x !== v); };
}
// midis[0] is the bass
export function playNotes(midis, t, dur) { midis.forEach((m, i) => voice(m, t, dur, i === 0 ? .22 : .14)); }

export function stopAll() {
  if (!actx) return;
  const now = actx.currentTime;
  liveVoices.forEach((v) => {
    try { v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0, now, .03); v.o1.stop(now + .25); v.o2.stop(now + .25); } catch (e) { /* already stopped */ }
  });
  liveVoices = [];
}
