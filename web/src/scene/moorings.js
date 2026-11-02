// Moored tiers for PeriodRiver (pure, no three, so bridge/check.mjs can test it). Coordinates are
// a = metres along the river from the bridge, c = metres across it (signed, + towards the north bank).
export const AXIS = (20.95 * Math.PI) / 180 // meta bridge_axis_deg; the river runs across it
const ALONG = [Math.cos(AXIS), Math.sin(AXIS)] // downstream, grid (x, z)
const ACROSS = [Math.sin(AXIS), -Math.cos(AXIS)] // towards the north bank
export const at = (a, c) => [ALONG[0] * a + ACROSS[0] * c, ALONG[1] * a + ACROSS[1] * c]
// wet(a, c) for layout(): the bare LiDAR is below the river surface (plus 0.8 m) there; heightAt is Terrain.jsx's, passed in to keep this file pure
export const riverWet = (t, heightAt) => (a, c) => { const h = heightAt(t, ...at(a, c)); return h != null && h < t.meta.water_h - t.meta.origin_h + 0.8 }
export const HULL = { lighter: [12, 4.4], barge: [24, 5.6] } // [length along the river, beam]
const GAP = 1 // m clear between hulls; covers the ±0.06 rad yaw jitter on a 24 m barge
const dims = (m) => HULL[m.barge ? 'barge' : 'lighter']

export function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) }

export function clash(p, q) {
  const [lp, bp] = dims(p), [lq, bq] = dims(q)
  return Math.abs(p.a - q.a) < (lp + lq) / 2 + GAP && Math.abs(p.c - q.c) < (bp + bq) / 2 + GAP
}

// Two passes, each hull kept only if wet(a, c) holds at its four corners and it clears every hull placed:
// first the mid-river barge tiers (46 and 54 m off the centreline, clear of the 30 m fairway the ship and
// tug use), then the lighter tiers off each bank (62-112 m), every 15 m along and clear of the bridge.
const TIERS = [
  { step: 30, across: [46, 54], skip: 0.25, barge: 1 },
  { step: 15, across: [62, 70, 78, 86, 94, 102, 110], skip: 0.35, barge: 0.3 },
]
export function layout(wet) {
  const r = rng(7), out = []
  for (const tier of TIERS) {
    for (let a = -560; a <= 620; a += tier.step) {
      if (Math.abs(a) < 120) continue
      for (const side of [-1, 1]) {
        for (const c of tier.across) {
          if (r() < tier.skip) continue
          const m = { a, c: c * side, jitter: (r() - 0.5) * 0.12, barge: r() < tier.barge }
          const [len, beam] = dims(m)
          if (![[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([u, v]) => wet(a + (u * len) / 2, m.c + (v * beam) / 2))) continue
          if (out.some((o) => clash(o, m))) continue
          out.push(m)
        }
      }
    }
  }
  return out
}
