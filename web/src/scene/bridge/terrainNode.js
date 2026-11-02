// Node-side terrain for check.mjs: decodes bare.png (8-bit RGB, non-interlaced) the way Terrain.jsx does with createImageBitmap, and mirrors its heightAt (JSX, so node cannot import it).
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

// mirror of Terrain.jsx heightAt: bilinear, scene metres relative to origin_h, null off the tile
export function heightAt({ meta, heights, w, h }, x, z) {
  const [minE, , maxE, maxN] = meta.bbox_osgb
  const [oE, oN] = meta.origin_osgb
  const res = (maxE - minE) / w
  const j = (x + oE - minE) / res - 0.5, i = (z - oN + maxN) / res - 0.5
  if (!(j >= 0 && i >= 0 && j <= w - 1 && i <= h - 1)) return null
  const j0 = Math.min(Math.floor(j), w - 2), i0 = Math.min(Math.floor(i), h - 2)
  const fj = j - j0, fi = i - i0, k = i0 * w + j0
  const top = heights[k] * (1 - fj) + heights[k + 1] * fj
  const bot = heights[k + w] * (1 - fj) + heights[k + w + 1] * fj
  return top * (1 - fi) + bot * fi - meta.origin_h
}
