// Standard MIDI File (format 0) export, plus a tiny stored ZIP writer for hosts that only allow .zip downloads.
const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };

// events: [{midi: [bass, ...upper], ticks}] with 480 ticks per quarter note
export function buildMidi(events, bpm, keySig = 0, minor = false) {
  const ppq = 480, ev = [], push = (dt, ...bytes) => ev.push(...vlq(dt), ...bytes);
  const name = [...new TextEncoder().encode("Backward harmony")];
  push(0, 0xff, 0x03, name.length, ...name);
  const us = Math.round(60000000 / bpm);
  push(0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255);
  push(0, 0xff, 0x58, 4, 4, 2, 24, 8);
  push(0, 0xff, 0x59, 2, keySig & 255, minor ? 1 : 0);
  push(0, 0xc0, 0); // acoustic grand piano
  for (const e of events) {
    e.midi.forEach((m, i) => push(0, 0x90, m, i ? 78 : 90));
    e.midi.forEach((m, i) => push(i ? 0 : e.ticks, 0x80, m, 0));
  }
  push(0, 0xff, 0x2f, 0);
  const L = ev.length;
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, ppq >> 8, ppq & 255,
    0x4d, 0x54, 0x72, 0x6b, (L >>> 24) & 255, (L >> 16) & 255, (L >> 8) & 255, L & 255, ...ev,
  ]);
}

export function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    let c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Single-entry, uncompressed ZIP archive
export function zipBytes(filename, data) {
  const name = new TextEncoder().encode(filename), crc = crc32(data), n = data.length;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1, nl = name.length;
  const buf = new Uint8Array(30 + nl + n + 46 + nl + 22), dv = new DataView(buf.buffer);
  const u16 = (o, v) => dv.setUint16(o, v, true), u32 = (o, v) => dv.setUint32(o, v, true);
  u32(0, 0x04034b50); u16(4, 20); u16(12, date); u32(14, crc); u32(18, n); u32(22, n); u16(26, nl);
  buf.set(name, 30); buf.set(data, 30 + nl);
  const c = 30 + nl + n;
  u32(c, 0x02014b50); u16(c + 4, 20); u16(c + 6, 20); u16(c + 14, date); u32(c + 16, crc); u32(c + 20, n); u32(c + 24, n); u16(c + 28, nl);
  buf.set(name, c + 46);
  const e = c + 46 + nl;
  u32(e, 0x06054b50); u16(e + 8, 1); u16(e + 10, 1); u32(e + 12, 46 + nl); u32(e + 16, c);
  return buf;
}
