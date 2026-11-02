// The bridge's big silhouettes: the only bridge meshes that cast shadows (Look.jsx) or show in the river's mirror
// (Water.jsx). Traffic, cabins and their controls, barriers, machinery, stairs and lifts, and anything under
// MIN_R metres across (lamps, rails, small fittings) draw in the main pass only: their shadows and reflections
// read as nothing, and each one was a draw call in two more passes.
import * as THREE from 'three'

const SMALL_PARTS = /^(traffic|barrier|cabin|engine-room|accumulator|hydraulic-engine|pivot|counterweight|stairs|lift)/
const MIN_R = 8 // m, the mesh's world bounding-sphere radius
const _s = new THREE.Sphere()

// the outermost named ancestor below 'tower-bridge' (a Part id such as 'walkway-east'), or null outside the bridge
export function bridgePart(o) {
  let part = 'tower-bridge'
  for (let x = o; x; x = x.parent) {
    if (x.name === 'tower-bridge') return part
    if (x.name) part = x.name
  }
  return null
}

// true for a bridge mesh worth a shadow and a reflection; cached on the mesh (its part and size do not change)
export function bigSilhouette(o) {
  if (o.userData.bigSilhouette !== undefined) return o.userData.bigSilhouette
  const part = bridgePart(o)
  let big = false
  if (part && !SMALL_PARTS.test(part) && o.geometry) {
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere()
    _s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld)
    big = _s.radius >= MIN_R
  }
  return (o.userData.bigSilhouette = big)
}
