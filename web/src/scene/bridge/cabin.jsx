// Driver's cabin on the upstream (west) side of each pier, facing the opening: the 1894 bridge
// was worked from here by lever, watching an angle indicator. Two Parts per side: the shell
// `cabin-<side>` (x-rays when either is selected, xray.js) and `cabin-controls-<side>`: lever
// pedestal (follows store.bascule), leaf-angle dial, accumulator pressure gauge, bolt telltale.
// HALF-LOCAL frame (mount inside <Half>); cabin origin = floor centre, front window faces +z.
// status: inferred position and fittings; not yet in data.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../../store.js'
import { box, merge, M } from './geom.js'
import { gaugePsi, PRESSURE_PSI } from './hydraulics.js'
import { L } from './structures.jsx'
import { Part } from './Part.jsx'

const W = 4, D = 3.4, H = 3, T = 0.25 // outer size, wall thickness
const SILL = 1.1, HEAD = 2.4
const disc = (r, x, y, z) => new THREE.CylinderGeometry(r, r, 0.06, 20).rotateX(Math.PI / 2).translate(x, y, z)

// A wall along x (front/back) or z (sides) with a window band between SILL and HEAD and `n` panes.
function wall(o, len, alongX, at, n) {
  const p = (w, h, d, a, y) => (alongX ? box(w, h, d, a, y, at) : box(d, h, w, at, y, a))
  o.stone.push(p(len, SILL, T, 0, SILL / 2), p(len, H - HEAD, T, 0, (H + HEAD) / 2))
  for (let i = 0; i <= n; i++) o.white.push(p(0.12, HEAD - SILL, T + 0.04, -len / 2 + (len * i) / n, (SILL + HEAD) / 2))
  o.white.push(p(len, 0.08, T + 0.1, 0, SILL), p(len, 0.08, T + 0.04, 0, HEAD))
}

function shell() {
  const o = { stone: [], white: [], slate: [] }
  o.stone.push(box(W + 0.4, 0.3, D + 0.4, 0, -0.1, 0)) // plinth, 5 cm proud of the pier top (no z-fight)
  wall(o, W, true, D / 2 - T / 2, 3) // front, onto the opening
  wall(o, W, true, -D / 2 + T / 2, 2)
  for (const s of [-1, 1]) wall(o, D - 2 * T, false, s * (W / 2 - T / 2), 2)
  o.stone.push(box(W + 0.3, 0.2, D + 0.3, 0, H + 0.1, 0))
  o.slate.push(new THREE.ConeGeometry(1, 1.4, 4).rotateY(Math.PI / 4).scale((W + 0.5) / 1.414, 1, (D + 0.5) / 1.414).translate(0, H + 0.9, 0))
  return Object.entries(o).map(([k, gs]) => [k, merge(gs)])
}

// Instrument positions (cabin-local). Faces look -z, towards the driver at the lever.
const DIAL = [-1.15, 1.75, D / 2 - T - 0.08]
const GAUGE = [1.15, 1.75, D / 2 - T - 0.08]
const LEVER = [0, 1.05, 0.35]
const LAMP = [0.45, 1.12, 0.5]

function controls() {
  const iron = [box(0.5, 1, 0.5, 0, 0.5, LEVER[2]), box(0.7, 0.1, 0.6, 0, 1.03, LEVER[2])] // pedestal
  const white = []
  for (const [x, y, z] of [DIAL, GAUGE]) {
    iron.push(box(0.12, y - 0.3, 0.12, x, (y - 0.3) / 2, z), disc(0.36, x, y, z + 0.04)) // post + bezel
    white.push(disc(0.31, x, y, z))
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (x < 0 ? Math.PI / 2 : 1.5 * Math.PI) - (x < 0 ? 0 : 0.25 * Math.PI)
      iron.push(box(0.02, 0.06, 0.02, 0, 0.26, 0).rotateZ(a).translate(x, y, z - 0.04)) // scale ticks
    }
  }
  iron.push(box(0.16, 0.12, 0.16, LAMP[0], LAMP[1] - 0.05, LAMP[2]))
  return { iron: merge(iron), white: merge(white) }
}

const needle = () => box(0.025, 0.27, 0.015, 0, 0.13, -0.05) // just proud of the face

export function Cabin({ side, rt }) {
  const n = side === 'north'
  const home = [n ? -19 : 19, L.pierTop, L.pierZ + 9] // west is -x north-local, +x in the turned south half
  const sh = useMemo(shell, [])
  const ct = useMemo(controls, [])
  const geo = useMemo(() => ({ needle: needle(), handle: merge([box(0.05, 0.8, 0.05, 0, 0.4, 0), box(0.16, 0.12, 0.12, 0, 0.82, 0)]), lamp: new THREE.SphereGeometry(0.07, 10, 8) }), [])
  const lever = useRef(), dial = useRef(), gauge = useRef(), lamp = useRef()
  const psi = useRef(PRESSURE_PSI)
  useFrame((_, dt) => {
    const s = rt.sim
    lever.current.rotation.x = -0.6 + 1.2 * useStore.getState().bascule // thrown forward to raise
    dial.current.rotation.z = -Math.PI / 2 + Math.PI / 2 * (s.angle / (s.max || 1)) // reads the leaf angle
    psi.current += (gaugePsi(s) - psi.current) * (1 - Math.exp(-Math.min(dt, 0.1) * 2))
    gauge.current.rotation.z = 0.75 * Math.PI - 1.5 * Math.PI * (psi.current / 1000)
    lamp.current.material.color.set(s.locked ? '#5dff7a' : '#ff4a3a')
  })
  return (
    <>
      <Part id={`cabin-${side}`} rt={rt} home={home} explode={[n ? -6 : 6, 6, 0]} xray>
        {sh.map(([k, g]) => <mesh key={k} geometry={g} material={M[k]} castShadow receiveShadow />)}
      </Part>
      <Part id={`cabin-controls-${side}`} rt={rt} home={home} explode={[n ? -6 : 6, 3, 0]}>
        <mesh geometry={ct.iron} material={M.iron} castShadow />
        <mesh geometry={ct.white} material={M.white} />
        <mesh ref={lever} geometry={geo.handle} material={M.brass} position={LEVER} />
        <mesh ref={dial} geometry={geo.needle} material={M.iron} position={DIAL} />
        <mesh ref={gauge} geometry={geo.needle} material={M.iron} position={GAUGE} />
        <mesh ref={lamp} geometry={geo.lamp} material={M.white} position={LAMP} />
      </Part>
    </>
  )
}
