// Period life on the river before 1950: lighters moored in tiers along the Pool of London and the wharves,
// with Thames sailing barges among them, steam tugs working the open channel and hand or hydraulic wharf cranes
// on the river walls of the working Pool of London (wiki-pool-of-london); positions inferred, not surveyed.
// Grid-aligned frame (x east, z south), like Terrain; moored only where the LiDAR says there is water. Low-poly and instanced: ten draw calls for the whole river.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { heightAt } from './Terrain.jsx'
import { layout, rng, AXIS, at, riverWet } from './moorings.js'

const ALONG = [Math.cos(AXIS), Math.sin(AXIS)] // downstream, (x, z)
const ACROSS = [Math.sin(AXIS), -Math.cos(AXIS)] // towards the north bank

// moorings: barge tiers mid-river and lighter tiers off each bank, kept clear of the bridge, the open channel and each other
function moorings(t) {
  const water = t.meta.water_h - t.meta.origin_h
  return layout(riverWet(t, heightAt)).map((m) => { const [x, z] = at(m.a, m.c); return { x, y: water, z, yaw: -AXIS + m.jitter, barge: m.barge } })
}

// steam tugs in the open channel, heading up or down river
function tugs() {
  const r = rng(11), out = []
  for (const a of [-470, -300, 210, 330, 520]) {
    const c = (r() - 0.5) * 50, down = r() < 0.5
    out.push({ x: ALONG[0] * a + ACROSS[0] * c, y: 0, z: ALONG[1] * a + ACROSS[1] * c, yaw: -AXIS + (down ? 0 : Math.PI) + (r() - 0.5) * 0.1 })
  }
  return out
}

// wharf cranes: a post on the quay just behind the river wall, jib over the river.
// Not on Tower Wharf (the Tower's own frontage) and not by the bridge.
function cranes(t) {
  const water = t.meta.water_h - t.meta.origin_h
  const old = { ...t, heights: t.old }
  const r = rng(3), out = []
  for (let a = -560; a <= 620; a += 26) {
    if (Math.abs(a) < 110) continue
    for (const side of [-1, 1]) {
      if (side === 1 && a > -380 && a < -110) continue // Tower Wharf
      if (r() < 0.45) continue
      let c = 40
      const at = (c) => [ALONG[0] * a + ACROSS[0] * c * side, ALONG[1] * a + ACROSS[1] * c * side]
      for (; c < 170; c += 1) { const h = heightAt(old, ...at(c)); if (h == null || h > water + 1) break }
      if (c >= 170 || heightAt(old, ...at(c)) == null) continue
      // only on a wall: the ground reaches quay level (water + 2 m) within 6 m; a sloping foreshore is mud, no crane
      let top = c
      while (top < c + 6 && heightAt(old, ...at(top)) < water + 2) top += 0.5
      if (heightAt(old, ...at(top)) < water + 2) continue
      const [x, z] = at(top + 1.5) // on the quay just behind the wall edge, the jib reaching out over the water
      out.push({ x, y: heightAt(old, x, z), z, yaw: Math.atan2(-side * Math.cos(AXIS), -side * Math.sin(AXIS)) })
    }
  }
  return out
}

function Instanced({ items, geometry, color, at }) {
  const ref = useRef()
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }), [color])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1)
    items.forEach((it, i) => {
      q.setFromEuler(e.set(0, it.yaw, 0))
      const local = new THREE.Vector3(...at).applyQuaternion(q)
      ref.current.setMatrixAt(i, m.compose(new THREE.Vector3(it.x, it.y, it.z).add(local), q, s))
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items, at])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow receiveShadow />
}

const GEO = {
  lighter: new THREE.BoxGeometry(12, 1.6, 4.4),
  cargo: new THREE.BoxGeometry(9, 0.4, 3.4),
  barge: new THREE.BoxGeometry(24, 2, 5.6),
  mast: new THREE.CylinderGeometry(0.18, 0.25, 22, 6),
  // spritsail: luff on the mast, the peak held up and aft by the sprit, a loose-footed foot over the hatches
  sail: new THREE.ShapeGeometry(new THREE.Shape([[-3.2, -6.5], [5, -7.5], [2.6, 7.5], [-3.2, 5.6]].map(([x, y]) => new THREE.Vector2(x, y)))),
  tugHull: new THREE.BoxGeometry(16, 2.4, 4.6),
  tugHouse: new THREE.BoxGeometry(5, 2, 3),
  funnel: new THREE.CylinderGeometry(0.55, 0.6, 4, 10),
  cranePost: new THREE.BoxGeometry(0.9, 15, 0.9),
  // jib leaning out over the water (local +x), from the post head
  craneJib: new THREE.BoxGeometry(11, 0.35, 0.35).translate(5.5, 0, 0).rotateZ(0.65).translate(0, 4, 0),
}
const AT = {
  lighter: [0, 0.5, 0], cargo: [0, 1.25, 0], barge: [0, 0.7, 0], mast: [-4, 12.5, 0], sail: [-0.8, 9.4, 0],
  tugHull: [0, 0.6, 0], tugHouse: [1, 2.8, 0], funnel: [-0.8, 5, 0], cranePost: [0, 6.5, 0], craneJib: [0, 6.5, 0],
}

function River({ t }) {
  const all = useMemo(() => moorings(t), [t])
  const lighters = all.filter((m) => !m.barge), barges = all.filter((m) => m.barge)
  const tg = useMemo(() => tugs().map((m) => ({ ...m, y: t.meta.water_h - t.meta.origin_h })), [t])
  const cr = useMemo(() => cranes(t), [t])
  return (
    <group name="period-river">
      <Instanced items={lighters} geometry={GEO.lighter} color="#1d1b19" at={AT.lighter} />
      <Instanced items={lighters} geometry={GEO.cargo} color="#6b5a43" at={AT.cargo} />
      <Instanced items={barges} geometry={GEO.barge} color="#2a2420" at={AT.barge} />
      <Instanced items={barges} geometry={GEO.mast} color="#5a4632" at={AT.mast} />
      <Instanced items={barges} geometry={GEO.sail} color="#74361f" at={AT.sail} />
      <Instanced items={tg} geometry={GEO.tugHull} color="#161412" at={AT.tugHull} />
      <Instanced items={tg} geometry={GEO.tugHouse} color="#6e5a44" at={AT.tugHouse} />
      <Instanced items={tg} geometry={GEO.funnel} color="#1b1a19" at={AT.funnel} />
      <Instanced items={cr} geometry={GEO.cranePost} color="#3b3026" at={AT.cranePost} />
      <Instanced items={cr} geometry={GEO.craneJib} color="#3b3026" at={AT.craneJib} />
    </group>
  )
}

export function PeriodRiver({ terrain }) {
  return terrain ? <River t={terrain} /> : null
}
