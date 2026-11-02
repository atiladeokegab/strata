// Node-side terrain for check.mjs: decodes bare.png (8-bit RGB, non-interlaced) the way Terrain.jsx does with createImageBitmap.
import { inflateSync } from 'node:zlib'

export function decodeHeights(buf, meta) {
  let p = 8, w, h, idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 2 || data[12]) throw new Error('bare.png: expected 8-bit RGB, non-interlaced') }
    if (type === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat)), bpp = 3, stride = w * bpp, px = new Uint8Array(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]
      px[row + x] = (raw[src + x] + pred) & 255
    }
  }
  const heights = new Float32Array(w * h), k = (meta.max_h - meta.min_h) / 65535
  for (let i = 0; i < w * h; i++) heights[i] = meta.min_h + (px[i * 3] * 256 + px[i * 3 + 1]) * k
  return { meta, heights, w, h }
}

