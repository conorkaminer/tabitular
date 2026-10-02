// Binary primitives shared by the browser codecs. No server or Node dependencies.
export const concat = (...parts) => {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};
export const number = (value, size, little = true) => {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[little ? i : size - i - 1] = (value >>> (i * 8)) & 255;
  return bytes;
};
const decoder = new TextDecoder('windows-1252');
export function stringBytes(value) {
  if (typeof value !== 'string') throw Error('Credits must be text');
  const bytes = [];
  for (const char of value) {
    let byte = -1;
    for (let i = 0; i < 256; i++) if (decoder.decode(Uint8Array.of(i)) === char) { byte = i; break; }
    if (byte < 0) throw Error('.tbt file titles and credits support Western European characters only');
    bytes.push(byte);
  }
  if (bytes.length > 65535) throw Error('Credit text is too long');
  return concat(number(bytes.length, 2), bytes);
}
export class Reader {
  constructor(data) { this.data = data; this.pos = 0; }
  read(n) {
    if (n < 0 || this.pos + n > this.data.length) throw Error('Truncated .tbt file data');
    const result = this.data.subarray(this.pos, this.pos + n); this.pos += n; return result;
  }
  num(n = 1) { return this.read(n).reduce((v, b, i) => v + b * 2 ** (i * 8), 0); }
  string() { return decoder.decode(this.read(this.num(2))); }
  runs(size) {
    const out = new Uint8Array(size); let position = 0;
    while (position < size) {
      const chunk = new Reader(this.read(this.num(2) * 2));
      if (!chunk.data.length) throw Error('Empty note chunk');
      while (chunk.pos < chunk.data.length) {
        const count = chunk.num() || chunk.num(2), value = chunk.num();
        if (!count || position + count > size) throw Error('Invalid run length');
        out.fill(value, position, position + count); position += count;
      }
    }
    return out;
  }
}
export async function compress(data, decompress = false) {
  const stream = decompress ? new DecompressionStream('deflate') : new CompressionStream('deflate');
  const reader = new Blob([data]).stream().pipeThrough(stream).getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      length += value.length;
      if (length > 16_000_000) throw Error('Invalid or oversized compressed data');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  return concat(...chunks);
}
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
