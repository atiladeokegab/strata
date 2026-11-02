// Barrage balloons over the Pool of London, 1939-1945. Balloon Command was set up in 1938 and "by the middle of 1940,
// there were 1,400 balloons, a third over the London area" (wiki-barrage-balloon). The balloon is the standard
// low-zone type, about 19 m long and 7.6 m across with three tail fins. Where each one flies and how high are
// illustrative (inferred): the real sites are not in our sources. Grid-aligned frame (x east, z south), like Terrain.
// No tether: a steel cable is invisible at this range, and drawn it read as a scratch on the frame.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { heightAt } from './Terrain.jsx'

// [x, z, height above the ground] in metres; kept off the bridge so none hides it. 300-600 m out and 110-190 m up,
// inside the 1940 overcast (FogExp2 0.0014 is half gone by 600 m), so they show in the usual frames; real ones flew higher.
const SITES = [
  [-480, -300, 160], [-300, -520, 190], [-60, -440, 130], [220, -480, 170], [430, -300, 150], [520, 20, 180],
  [420, 330, 140], [200, 500, 190], [-120, 480, 150], [-380, 340, 170], [-540, 60, 140], [120, -330, 110],
]
const WIND = 0.6 // every balloon rides nose into the same wind

function balloonGeometry() {
  const body = new THREE.SphereGeometry(1, 24, 14).scale(9.5, 3.8, 3.8)
  const fins = [0, 1, 2].map((i) => new THREE.BoxGeometry(5, 3.6, 0.15).translate(-7.6, 3, 0).rotateX(Math.PI / 3 + (i * 2 * Math.PI) / 3))
  return mergeGeometries([body, ...fins].map((g) => g.toNonIndexed()))
}

export function Barrage({ terrain }) {
  const balloons = useRef()
  const geo = useMemo(() => ({ balloon: balloonGeometry() }), [])
  const mats = useMemo(() => ({
    balloon: new THREE.MeshStandardMaterial({ color: '#8d9195', roughness: 0.55, metalness: 0.15 }), // darker than the grey sky, so it reads
  }), [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, WIND, 0)), one = new THREE.Vector3(1, 1, 1)
    SITES.forEach(([x, z, up], i) => {
      const g = heightAt({ ...terrain, heights: terrain.old }, x, z) ?? 0
      balloons.current.setMatrixAt(i, m.compose(new THREE.Vector3(x, g + up, z), q, one))
    })
    balloons.current.instanceMatrix.needsUpdate = true
    balloons.current.computeBoundingSphere()
  }, [terrain])
  useLayoutEffect(() => () => { Object.values(geo).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()) }, [geo, mats])
  return (
    <group name="barrage-balloons">
      <instancedMesh ref={balloons} args={[geo.balloon, mats.balloon, SITES.length]} castShadow />
    </group>
  )
}
