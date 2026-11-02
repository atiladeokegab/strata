// Pure terrain height lookup, shared by Terrain.jsx (browser) and bridge/check.mjs (node), so the two cannot drift.
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
