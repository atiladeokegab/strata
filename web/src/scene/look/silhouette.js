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

// the mesh's world bounding-sphere radius in metres, cached (bridge parts do not rescale)
function worldRadius(o) {
  if (o.userData.worldR !== undefined) return o.userData.worldR
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere()
  return (o.userData.worldR = _s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld).radius)
}

// true for a bridge mesh worth a shadow and a reflection; cached on the mesh (its part and size do not change)
export function bigSilhouette(o) {
  if (o.userData.bigSilhouette !== undefined) return o.userData.bigSilhouette
  const part = bridgePart(o)
  return (o.userData.bigSilhouette = !!(part && !SMALL_PARTS.test(part) && o.geometry && worldRadius(o) >= MIN_R))
}

// LITE: a bridge mesh under MIN_R hides from the cameras beyond FAR_HIDE m and shows again inside FAR_SHOW m,
// so nothing flickers at the boundary. At 400 m on a 390 px phone such a part is 1-2 px. It leaves layer 0
// rather than going invisible, so it never fights the bridge's own visibility switches.
const FAR_HIDE = 400
const FAR_SHOW = 370
export const smallBridgeMesh = (o) => !!(o.isMesh && o.geometry && bridgePart(o) && worldRadius(o) < MIN_R)
export function farHide(camera, meshes) {
  for (const o of meshes) {
    const src = o.isInstancedMesh ? o : o.geometry // an instanced mesh's sphere spans its instances
    if (!src.boundingSphere) src.computeBoundingSphere()
    _s.copy(src.boundingSphere).applyMatrix4(o.matrixWorld)
    const d = camera.position.distanceTo(_s.center) - _s.radius
    const hidden = !o.layers.isEnabled(0)
    if (!hidden && d > FAR_HIDE) o.layers.disable(0)
    else if (hidden && d < FAR_SHOW) o.layers.enable(0)
  }
}
