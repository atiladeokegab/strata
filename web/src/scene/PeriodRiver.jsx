// Period life on the river before 1950: lighters moored in tiers along the Pool of London and the wharves,
// with Thames sailing barges among them. Grid-aligned frame (x east, z south), like Terrain; moored only where
// the LiDAR says there is water. Low-poly and instanced: five draw calls for the whole river.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { heightAt } from './Terrain.jsx'

const AXIS = (20.95 * Math.PI) / 180 // meta bridge_axis_deg; the river runs across it
const ALONG = [Math.cos(AXIS), Math.sin(AXIS)] // downstream, (x, z)
const ACROSS = [Math.sin(AXIS), -Math.cos(AXIS)] // towards the north bank

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) }

// moorings: tiers a few hulls deep off each bank, kept clear of the bridge and of the open channel
function moorings(t) {
  const water = t.meta.water_h - t.meta.origin_h
  const wet = (x, z) => { const h = heightAt(t, x, z); return h != null && h < water + 0.8 }
  const r = rng(7), out = []
  for (let a = -560; a <= 620; a += 15) {
    if (Math.abs(a) < 120) continue
    for (const side of [-1, 1]) {
      for (let c = 62; c <= 112; c += 8) {
        if (r() < 0.35) continue
        const x = ALONG[0] * a + ACROSS[0] * c * side, z = ALONG[1] * a + ACROSS[1] * c * side
        // all four hull corners in the water
        if (![[-7, -3], [7, -3], [-7, 3], [7, 3]].every(([u, v]) => wet(x + ALONG[0] * u + ACROSS[0] * v, z + ALONG[1] * u + ACROSS[1] * v))) continue
        out.push({ x, y: water, z, yaw: -AXIS + (r() - 0.5) * 0.12, barge: r() < 0.18 })
      }
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
  sail: new THREE.PlaneGeometry(10, 15),
}
const AT = { lighter: [0, 0.5, 0], cargo: [0, 1.25, 0], barge: [0, 0.7, 0], mast: [-4, 12.5, 0], sail: [-0.8, 10, 0] }

function River({ t }) {
  const all = useMemo(() => moorings(t), [t])
  const lighters = all.filter((m) => !m.barge), barges = all.filter((m) => m.barge)
  return (
    <group name="period-river">
      <Instanced items={lighters} geometry={GEO.lighter} color="#1d1b19" at={AT.lighter} />
      <Instanced items={lighters} geometry={GEO.cargo} color="#6b5a43" at={AT.cargo} />
      <Instanced items={barges} geometry={GEO.barge} color="#2a2420" at={AT.barge} />
      <Instanced items={barges} geometry={GEO.mast} color="#5a4632" at={AT.mast} />
      <Instanced items={barges} geometry={GEO.sail} color="#8e3b1e" at={AT.sail} />
    </group>
  )
}

export function PeriodRiver({ terrain }) {
  return terrain ? <River t={terrain} /> : null
}
