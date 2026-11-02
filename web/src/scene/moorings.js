// Moored tiers for PeriodRiver (pure, no three, so bridge/check.mjs can test it). Coordinates are
// a = metres along the river from the bridge, c = metres across it (signed, + towards the north bank).
export const AXIS = (20.95 * Math.PI) / 180 // meta bridge_axis_deg; the river runs across it
const ALONG = [Math.cos(AXIS), Math.sin(AXIS)] // downstream, grid (x, z)
const ACROSS = [Math.sin(AXIS), -Math.cos(AXIS)] // towards the north bank
export const at = (a, c) => [ALONG[0] * a + ACROSS[0] * c, ALONG[1] * a + ACROSS[1] * c]
// wet(a, c) for layout(): the bare LiDAR is at least DEPTH below the river surface there (a hull needs water under it, not mud); heightAt is Terrain.jsx's, passed in to keep this file pure
export const riverWet = (t, heightAt) => (a, c) => { const h = heightAt(t, ...at(a, c)); return h != null && h < t.meta.water_h - t.meta.origin_h - DEPTH }
export const DEPTH = 1 // m of water under every sampled point
export const PAD = 2 // m the footprint is grown by before sampling, so no end or side overhangs the foreshore lip
// the footprint grown by PAD and turned by the hull's yaw jitter: corners, mid-sides and centre
export const samples = (m) => { const [len, beam] = dims(m), [ca, sa] = [Math.cos(m.jitter), Math.sin(m.jitter)], out = []
  for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
    const du = u * (len / 2 + PAD), dv = v * (beam / 2 + PAD)
    out.push([m.a + du * ca - dv * sa, m.c + du * sa + dv * ca])
  }
  return out }
export const HULL = { lighter: [12, 4.4], barge: [24, 5.6] } // [length along the river, beam]
export const GAP = 2 // m clear between hulls (measured on the turned footprints); 1 m read as touching
const dims = (m) => HULL[m.barge ? 'barge' : 'lighter']

export function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) }

// Turned hull rectangles, each grown by GAP / 2, overlap: separating-axis test on the four edge normals.
export function clash(p, q) {
  const box = (m) => { const [len, beam] = dims(m); return { u: [Math.cos(m.jitter), Math.sin(m.jitter)], hl: len / 2 + GAP / 2, hb: beam / 2 + GAP / 2 } }
  const P = box(p), Q = box(q), d = [q.a - p.a, q.c - p.c], dot = (x, y) => x[0] * y[0] + x[1] * y[1]
  const r = (B, n) => B.hl * Math.abs(dot(B.u, n)) + B.hb * Math.abs(B.u[0] * n[1] - B.u[1] * n[0])
  return [P.u, [-P.u[1], P.u[0]], Q.u, [-Q.u[1], Q.u[0]]].every((n) => Math.abs(dot(d, n)) < r(P, n) + r(Q, n))
}

// Two passes, each hull kept only if wet(a, c) holds at every padded sample and it clears every hull placed:
// first the mid-river barge tiers (46 and 54 m off the centreline, clear of the 30 m fairway the ship and
// tug use), then barges and lighters in tiers off each bank (62-112 m) clear of the bridge.
const TIERS = [
  { step: 30, across: [46, 54], skip: 0.25, barge: 1 },
  { step: 30, across: [62, 70, 78, 86, 94, 102, 110], skip: 0.6, barge: 1 }, // barges first, or the lighters crowd them out
  { step: 15, across: [62, 70, 78, 86, 94, 102, 110], skip: 0.35, barge: 0 },
]
export function layout(wet) {
  const r = rng(7), out = []
  for (const tier of TIERS) {
    for (let a = -560; a <= 620; a += tier.step) {
      if (Math.abs(a) < 120) continue
      for (const side of [-1, 1]) {
        for (const c of tier.across) {
          if (r() < tier.skip) continue
          // not a car park: each hull drifts ±2 m along, ±1.5 m across and ±8° in yaw off its slot
          const m = { a: a + (r() - 0.5) * 3, c: (c + (r() - 0.5) * 2) * side, jitter: (r() - 0.5) * 0.28, barge: r() < tier.barge }
          if (!samples(m).every(([sa, sc]) => wet(sa, sc))) continue
          if (out.some((o) => clash(o, m))) continue
          out.push(m)
        }
      }
    }
  }
  return out
}
