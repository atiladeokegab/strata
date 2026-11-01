// <RiverCraft />: the era's small craft (riverSim.js), one InstancedMesh per hull type. Models are
// built bow-west (-x) at the waterline (local y 0) and coloured per vertex, so each type is one draw.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { beam, box, merge } from './geom.js'
import { L } from './structures.jsx'
import { createRiver, stepRiver, eraForYear } from './riverSim.js'

const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g
  const c = new THREE.Color(hex)
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [c.r, c.g, c.b]).flat(), 3))
  return g
}
const part = (hex, ...gs) => gs.map((g) => paint(g, hex))

const MODELS = {
  lighter: () => [
    ...part('#6e3b22', box(20, 2.2, 6, 0, 0.2, 0), box(2.5, 1.4, 5, -10.2, 0.6, 0)),
    ...part('#2a2622', box(15, 0.6, 4.6, 0.5, 1.6, 0)),
  ],
  skiff: () => [
    ...part('#a77b4f', box(6, 0.6, 1.3, 0, 0.25, 0), box(1.2, 0.5, 0.6, -3.2, 0.35, 0)),
    ...part('#2b2f3a', box(0.5, 0.9, 0.5, -0.8, 0.95, 0), box(0.5, 0.9, 0.5, 1, 0.95, 0)),
    ...part('#d9c9a3', beam([-0.6, 0.9, -2.4], [-1, 0.6, 2.4], 0.05), beam([1.2, 0.9, -2.4], [0.8, 0.6, 2.4], 0.05)),
  ],
  launch: () => [
    ...part('#14213d', box(12, 1.6, 3.6, 0, 0.3, 0), box(2, 1, 2.4, -6.6, 0.5, 0)),
    ...part('#f2f2ee', box(4.2, 1.8, 3, 0.5, 2, 0)),
    ...part('#ffd21f', box(12.05, 0.35, 3.65, 0, 1, 0)),
    ...part('#2a6cff', box(0.4, 0.4, 0.4, 0.5, 3.1, 0)),
  ],
  rib: () => [
    ...part('#3b3f45', beam([-4.5, 0.4, -1.1], [4.5, 0.4, -1.1], 0.45, 8), beam([-4.5, 0.4, 1.1], [4.5, 0.4, 1.1], 0.45, 8)),
    ...part('#22252a', box(9, 0.4, 2.2, 0, 0.3, 0), box(1, 1.2, 1, 2, 1, 0)),
    ...part('#ff6a13', ...[-2.5, -1, 0.5].flatMap((x) => [box(0.6, 0.8, 0.5, x, 1, -0.6), box(0.6, 0.8, 0.5, x, 1, 0.6)])),
  ],
  pontoon: () => [
    ...part('#8e9196', box(24, 1.2, 6, 0, 0.2, 0)),
    ...part('#e9e6dc', box(6, 2.2, 4, 4, 1.9, 0)),
    ...part('#30343a', box(24, 0.1, 0.1, 0, 1.8, -2.9), box(24, 0.1, 0.1, 0, 1.8, 2.9)),
  ],
}

const dummy = new THREE.Object3D()

function Fleet({ craft, type }) {
  const ref = useRef()
  const geo = useMemo(() => merge(MODELS[type]()), [type])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), [])
  const mine = craft.filter((c) => c.type === type)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    mine.forEach((c, i) => {
      dummy.position.set(c.x, L.hw + Math.sin(t * 1.3 + i * 2) * 0.12, c.z)
      dummy.rotation.set(Math.sin(t * 0.9 + i) * 0.03, c.dir > 0 ? Math.PI : 0, 0)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, mine.length]} castShadow frustumCulled={false} />
}

export function RiverCraft({ year, ship, vessel }) {
  const era = eraForYear(year)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const craft = useMemo(() => createRiver(year), [era])
  const foot = useRef({ x: 0, bow: 0, stern: 0 })
  useFrame((_, dt) => {
    Object.assign(foot.current, { x: ship.x, bow: vessel.bow, stern: vessel.stern })
    stepRiver(craft, foot.current, Math.min(dt, 0.1))
  })
  const types = [...new Set(craft.map((c) => c.type))]
  return types.map((t) => <Fleet key={`${era}-${t}`} craft={craft} type={t} />)
}
