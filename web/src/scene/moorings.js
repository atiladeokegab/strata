// Moored tiers for PeriodRiver (pure, no three, so bridge/check.mjs can test it). Coordinates are
// a = metres along the river from the bridge, c = metres across it (signed, + towards the north bank).
export const HULL = { lighter: [12, 4.4], barge: [24, 5.6] } // [length along the river, beam]
const GAP = 1 // m clear between hulls; covers the ±0.06 rad yaw jitter on a 24 m barge
const dims = (m) => HULL[m.barge ? 'barge' : 'lighter']

export function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) }

export function clash(p, q) {
  const [lp, bp] = dims(p), [lq, bq] = dims(q)
  return Math.abs(p.a - q.a) < (lp + lq) / 2 + GAP && Math.abs(p.c - q.c) < (bp + bq) / 2 + GAP
}

// Slots every 15 m along and 8 m across, 62-112 m off the centreline each side and clear of the
// bridge; a hull is kept only if wet(a, c) holds at its four corners and it clears every hull placed.
export function layout(wet) {
  const r = rng(7), out = []
  for (let a = -560; a <= 620; a += 15) {
    if (Math.abs(a) < 120) continue
    for (const side of [-1, 1]) {
      for (let c = 62; c <= 112; c += 8) {
        if (r() < 0.35) continue
        const m = { a, c: c * side, jitter: (r() - 0.5) * 0.12, barge: r() < 0.18 }
        const [len, beam] = dims(m)
        if (![[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([u, v]) => wet(a + (u * len) / 2, m.c + (v * beam) / 2))) continue
        if (out.some((o) => clash(o, m))) continue
        out.push(m)
      }
    }
  }
  return out
}
