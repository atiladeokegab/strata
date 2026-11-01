// <ConstructionSite />: the temporary works for one half (north-local frame), so each year of
// the 1886-1893 build reads at a glance. Geometry is merged per material per stage.
// status: inferred from period photographs (wiki-tb); positions are illustrative, not surveyed.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { beam, box, merge, M } from './geom.js'
import { L } from './structures.jsx'

const Z = L.pierZ
const tx = L.towerHalfX + 1.5
const tz = L.towerHalfZ + 1.5

// Square timber trestle from y0 to y1 with cross bracing.
function trestle(gs, x, z, w, y0, y1, r = 0.18) {
  const c = [[-w, -w], [w, -w], [w, w], [-w, w]]
  for (const [a, b] of c) gs.push(beam([x + a, y0, z + b], [x + a, y1, z + b], r, 4))
  for (let i = 0; i < 4; i++) {
    const [a, b] = c[i], [a2, b2] = c[(i + 1) % 4]
    gs.push(beam([x + a, y0, z + b], [x + a2, y1, z + b2], r * 0.6, 4))
    gs.push(beam([x + a, y1, z + b], [x + a2, y1, z + b2], r * 0.8, 4))
  }
}

function hull(len, w, x, z, rotY = 0) {
  // flat-bottomed lighter: hull, raised coamings, a hold
  return merge([box(w, 2.2, len, 0, 0.1, 0), box(w * 0.7, 0.6, len * 0.6, 0, 1.5, 0)])
    .rotateY(rotY)
    .translate(x, L.hw + 0.6, z)
}

// stage 0: timber staging round the cofferdam, a steam piling rig, moored barges
function PierWorks() {
  const g = useMemo(() => {
    const timber = [], iron = []
    const y = L.hw + 2.6, ex = 36, ez = 22
    // staging deck in four runs round the cofferdam, on pile bents
    timber.push(box(ex * 2, 0.4, 3, 0, y, Z - ez), box(ex * 2, 0.4, 3, 0, y, Z + ez))
    timber.push(box(3, 0.4, ez * 2, -ex, y, Z), box(3, 0.4, ez * 2, ex, y, Z))
    for (let x = -ex; x <= ex; x += 6) for (const s of [-1, 1]) timber.push(beam([x, L.bed, Z + s * ez], [x, y, Z + s * ez], 0.25, 5))
    for (let z = -ez + 6; z < ez; z += 6) for (const s of [-1, 1]) timber.push(beam([s * ex, L.bed, Z + z], [s * ex, y, Z + z], 0.25, 5))
    // jetty out towards the shore
    timber.push(box(4, 0.4, 30, 18, y, Z - ez - 15))
    for (let z = -ez - 3; z > -ez - 30; z -= 6) for (const s of [16.5, 19.5]) timber.push(beam([s, L.bed, Z + z], [s, y, Z + z], 0.22, 5))
    // piling rig on the staging: two tall leaders, back stays, a boiler and a drop hammer
    const px = -ex, pz = Z + 8, top = y + 18
    timber.push(box(6, 0.6, 6, px, y + 0.5, pz))
    for (const s of [-0.8, 0.8]) timber.push(beam([px + s, y, pz - 2.4], [px + s, top, pz - 2.4], 0.3, 6))
    for (const s of [-1, 1]) timber.push(beam([px + s * 2.6, y, pz + 2.8], [px, top - 1, pz - 2.4], 0.2, 5))
    timber.push(box(2.4, 0.5, 0.6, px, top, pz - 2.4))
    iron.push(beam([px - 1.2, y + 0.8, pz + 1.5], [px - 1.2, y + 3.8, pz + 1.5], 1.1, 10)) // vertical boiler
    iron.push(beam([px - 1.2, y + 3.8, pz + 1.5], [px - 1.2, y + 7.5, pz + 1.5], 0.25, 6)) // chimney
    iron.push(beam([px, top, pz - 2.4], [px, y + 9, pz - 2.4], 0.05, 4)) // hammer rope
    // barges moored alongside the staging
    iron.push(hull(22, 6, -ex - 8, Z - 4), hull(18, 5.5, ex + 8, Z + 6), hull(20, 6, 6, Z + ez + 7, Math.PI / 2))
    return { timber: merge(timber), iron: merge(iron), hammer: box(1.6, 1.8, 1.6) , hx: px, hz: pz - 2.4, hy: y + 9 }
  }, [])
  const hammer = useRef()
  useFrame(({ clock }) => {
    // rope pulls the monkey up slowly, then it drops
    const t = (clock.elapsedTime % 3) / 3
    hammer.current.position.y = g.hy - 7 + (t < 0.85 ? t / 0.85 : 1 - (t - 0.85) / 0.15) * 7
  })
  return (
    <>
      <mesh geometry={g.timber} material={M.timber} castShadow receiveShadow />
      <mesh geometry={g.iron} material={M.iron} castShadow />
      <mesh ref={hammer} geometry={g.hammer} material={M.iron} position={[g.hx, g.hy, g.hz]} castShadow />
    </>
  )
}

// stages 1-4: a derrick on the frame top, slewing slowly, its hook bobbing
function Derrick({ y }) {
  const g = useMemo(() => {
    const mast = [], iron = []
    const h = 16
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) mast.push(beam([a * 1.2, 0, b * 1.2], [0, h, 0], 0.2, 5))
    mast.push(box(5, 0.5, 5, 0, 0, 0))
    // stiff legs back to the frame corners
    for (const s of [-1, 1]) mast.push(beam([s * 11, 0, 8], [0, h - 1, 0], 0.18, 5))
    const jib = [beam([0, 1.5, 0], [0, h - 2, 22], 0.28, 6), beam([0, h, 0], [0, h - 2, 22], 0.06, 4)]
    iron.push(beam([0, h - 2, 22], [0, 0, 22], 0.05, 4))
    return { mast: merge(mast), jib: merge(jib), rope: merge(iron), hook: merge([box(0.8, 1, 0.8), box(3, 2, 3, 0, -2, 0)]) }
  }, [])
  const slew = useRef()
  const hook = useRef()
  const rope = useRef()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    slew.current.rotation.y = Math.sin(t * 0.15) * 1.4
    const drop = 6 + Math.sin(t * 0.6) * 2.5
    hook.current.position.y = 14 - drop
    rope.current.scale.y = (drop + 0.0001) / 14
    rope.current.position.y = 14 * (1 - rope.current.scale.y)
  })
  return (
    <group position={[0, y, Z]}>
      <mesh geometry={g.mast} material={M.timber} castShadow />
      <group ref={slew}>
        <mesh geometry={g.jib} material={M.timber} castShadow />
        <mesh ref={rope} geometry={g.rope} material={M.iron} />
        <mesh ref={hook} geometry={g.hook} material={M.iron} position={[0, 8, 22]} castShadow />
      </group>
    </group>
  )
}

// stage 4: putlog scaffolding wrapping the tower, up to `top`
function Scaffold({ top }) {
  const geo = useMemo(() => {
    const gs = []
    const y0 = L.pierTop
    const post = (x, z) => gs.push(beam([x, y0, z], [x, top, z], 0.12, 4))
    for (let x = -tx; x <= tx + 0.01; x += (tx * 2) / 8) post(x, Z - tz), post(x, Z + tz)
    for (let z = -tz + (tz * 2) / 6; z < tz; z += (tz * 2) / 6) post(-tx, Z + z), post(tx, Z + z)
    for (let y = y0 + 2.5; y <= top; y += 2.5) {
      gs.push(box(tx * 2 + 1.5, 0.2, 1.4, 0, y, Z - tz), box(tx * 2 + 1.5, 0.2, 1.4, 0, y, Z + tz))
      gs.push(box(1.4, 0.2, tz * 2, -tx, y, Z), box(1.4, 0.2, tz * 2, tx, y, Z))
    }
    return merge(gs)
  }, [top])
  return <mesh geometry={geo} material={M.timber} castShadow receiveShadow />
}

// stage 2: timber centring under the bascule leaf while it is assembled
function Centring() {
  const geo = useMemo(() => {
    const gs = []
    for (let z = L.pivotZ + 3; z < -1; z += 4) {
      const top = -1 - 3.4 * (-z / -L.pivotZ) - 0.2
      for (const x of [-7, 0, 7]) trestle(gs, x, z, 1.2, L.hw, top, 0.16)
      gs.push(box(18, 0.3, 2.6, 0, top - 0.15, z))
    }
    return merge(gs)
  }, [])
  return <mesh geometry={geo} material={M.timber} castShadow />
}

// stage 3: travelling cradles on the high walkway girders
function Cradles() {
  const g = useMemo(() => {
    const gs = []
    const y0 = L.walkY - 1.5, y1 = L.walkY + L.walkH + 2.5
    for (const x of [-L.walkX, L.walkX]) {
      for (const sx of [-2.6, 2.6]) for (const dz of [-2, 2]) gs.push(beam([x + sx, y0, dz], [x + sx, y1, dz], 0.18, 5))
      for (const dz of [-2, 2]) gs.push(beam([x - 2.6, y1, dz], [x + 2.6, y1, dz], 0.2, 5))
      gs.push(box(6, 0.3, 5, x, y0, 0))
    }
    return merge(gs)
  }, [])
  const ref = useRef()
  useFrame(({ clock }) => {
    ref.current.position.z = Z + L.towerHalfZ + 6 + (0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.1)) * 18
  })
  return (
    <group ref={ref}>
      <mesh geometry={g} material={M.timber} castShadow />
    </group>
  )
}

export function ConstructionSite({ st, towerTop }) {
  // follow TowerBridge's clip planes (frame rising in stage 1, cladding in stage 4); the frame
  // geometry itself stops at L.bodyTop
  const rise = (to) => L.pierTop + (to - L.pierTop) * st.progress
  const workTop = st.stage === 1 ? rise(towerTop) : st.stage === 4 ? rise(towerTop + 2) : towerTop
  const frameTop = Math.min(L.bodyTop, workTop)
  return (
    <>
      {st.stage === 0 && <PierWorks />}
      {st.stage >= 1 && <Derrick y={frameTop} />}
      {st.stage === 2 && <Centring />}
      {st.stage === 3 && <Cradles />}
      {st.stage === 4 && <Scaffold top={workTop} />}
    </>
  )
}
