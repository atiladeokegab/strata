// Barrage balloons over the Pool of London, 1939-1945. Balloon Command was set up in 1938 and "by the middle of 1940,
// there were 1,400 balloons, a third over the London area" (wiki-barrage-balloon). The balloon is the standard
// low-zone type, about 19 m long and 7.6 m across with three tail fins. Where each one flies and how high are
// illustrative (inferred): the real sites are not in our sources. Grid-aligned frame (x east, z south), like Terrain.
// No tether: a steel cable is invisible at this range, and drawn it read as a scratch on the frame.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { heightAt } from './Terrain.jsx'

// [x, z, height above the ground] in metres; kept off the bridge so none hides it
const SITES = [
  [-620, -380, 260], [-420, -620, 340], [-150, -540, 300], [180, -600, 380], [460, -450, 280], [650, -200, 330],
  [560, 260, 300], [300, 520, 360], [-60, 600, 270], [-380, 430, 320], [-640, 160, 290], [80, -330, 230],
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
    balloon: new THREE.MeshStandardMaterial({ color: '#c3c6c7', roughness: 0.55, metalness: 0.15 }),
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
