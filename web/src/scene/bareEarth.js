// The approach corridor, shared with scripts/terrain/build.py (APPROACH there), which keeps the approach viaducts in
// the terrain's bare earth (bare.png, the EA LiDAR DTM). Here it bounds the bridge's own ground below.
export const APPROACH = { from: 133, to: 320, half: 20, road: 6 } // m along / either side of the axis / road half-width

// The bridge's own ground, in the scene frame (u downstream, v along the bridge, south +): the towers, piers and side
// spans to the abutments, the approach roadway either side of the axis, and the south-east engine house and
// accumulator (bridge/engineRoom.jsx: house x 20-44, z 146-166; accumulator at 18.9, 143.8). No city building may
// stand on any of it. The box stops at x 41, Anchor Brewhouse's west wall: the real landmark stays, and its corner
// shares 5 m2 with the house's north-east corner (x 41-44, z 146-150).
export const BRIDGE_GROUND = [[-32, -145, 32, 145], [-10, -APPROACH.to, 10, APPROACH.to], [15.5, 140.5, 41, 166.5]]

// True when a footprint (flat [x0, z0, x1, z1, ...] in the grid frame, turned by axisDeg into the scene) touches it.
export function onBridgeGround(o, axisDeg) {
  const t = (axisDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), n = o.length / 2
  const u = (i) => o[2 * i] * c + o[2 * i + 1] * s, v = (i) => -o[2 * i] * s + o[2 * i + 1] * c // three.js rotation-y
  return BRIDGE_GROUND.some(([u0, v0, u1, v1]) => {
    let inside = false // the rect's centre inside the footprint (a footprint wrapping the rect)
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [ua, va, ub, vb] = [u(i), v(i), u(j), v(j)]
      if ((va > cv) !== (vb > cv) && cu < ((ub - ua) * (cv - va)) / (vb - va) + ua) inside = !inside
      // Liang-Barsky: does edge a-b reach the rect?
      let lo = 0, hi = 1
      const clip = (p, q) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) lo = Math.max(lo, r); else hi = Math.min(hi, r); return lo <= hi }
      const du = ub - ua, dv = vb - va
      if (clip(-du, ua - u0) && clip(du, u1 - ua) && clip(-dv, va - v0) && clip(dv, v1 - va)) return true
    }
    return inside
  })
}
