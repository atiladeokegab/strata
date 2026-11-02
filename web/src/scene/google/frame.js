// Georeference: our frame is metres, origin at the centre of the Tower Bridge road deck, x east, y up, z south.
import * as THREE from 'three'

// lat/lon: the terrain's refined deck centre, OSGB 533670.3, 180265.1, through OSTN15 (1.8 m from where the
// tiles' own bridge put it). Height and bearing were measured by raycasting the tiles: Google's deck reads y=0,
// its towers' inner faces sit at z = +/-35 and its deck edges stay parallel to z (grid 20.95 deg + 1.51 convergence = 22.46).
export const ORIGIN = {
  lat: 51.505519, // degrees, centre of the deck between the bascules
  lon: -0.075378,
  height: 58, // WGS84 ellipsoid height of the road deck, m
  bearing: 22.8, // deg the real bridge axis is turned east of north at its north end; turning by it lays the bridge on our z axis
}

// ReorientationPlugin puts the origin at (0,0,0) with x west, z north; turning 180 deg about y gives x east, z south.
export const FRAME_ROTATION_Y = Math.PI + THREE.MathUtils.degToRad(ORIGIN.bearing)

// Google's own bridge is cut out so ours stands in the gap: one box per element of the whole bridge envelope, each
// from GAP.floor to the sky (so chains and tower tops go too). Only above the floor, so the tiles' Thames (y about
// -13.5) stays. Boxes are [x0, x1, z0, z1] in our frame; `both` mirrors one onto the north end (z -> -z).
// Our parts: piers |x| 28.8, z 30.5-60.5; towers |x| 13; chains x = +-10.5 up to the tower tops; shore abutment towers
// |x| 10-16, |z| 138.5-148.5 (Google's stand at 136-143); approach ramps to |z| 183.5; engine house x 20-44, z 146-166,
// accumulator at x 18.9, z 143.8 (south bank, east). Margins cover the tiles' ~2 m georeference error and blobby meshes.
export const GAP = {
  floor: -12,
  boxes: [
    { box: [-12, 12, -1, 186], both: true }, // deck, bascules and both approach ramps
    { box: [-20, 20, -1, 136], both: true }, // side spans and their chains, over the river
    { box: [-34, 34, -1, 66], both: true }, // piers and towers, walkways
    { box: [-18.5, 18.5, 126, 152], both: true }, // shore abutment towers and chain anchorages
    { box: [14, 49.5, 126, 171.5] }, // engine house, accumulator tower and chimney (south bank)
  ],
}
export const inGap = (x, y, z) => y > GAP.floor && GAP.boxes.some(({ box: [x0, x1, z0, z1], both }) =>
  x > x0 && x < x1 && ((z > z0 && z < z1) || (both && -z > z0 && -z < z1)))

const f = (v) => v.toFixed(1)
const DISCARD = `
  if (vStrataWorld.y > ${f(GAP.floor)} && (${GAP.boxes.map(({ box: [x0, x1, z0, z1], both }) =>
    `(vStrataWorld.x > ${f(x0)} && vStrataWorld.x < ${f(x1)} && ${both ? 'abs(vStrataWorld.z)' : 'vStrataWorld.z'} > ${f(z0)} && ${both ? 'abs(vStrataWorld.z)' : 'vStrataWorld.z'} < ${f(z1)})`).join(' ||\n    ')})) discard;`

// Adds the gap discard to a tile material (world-space test, so it holds however the tileset is placed).
export function cutGap(material) {
  if (material.userData.strataGap) return
  material.userData.strataGap = true
  const prev = material.onBeforeCompile // TilesFadePlugin's fade shader, if it wrapped this material first
  const prevKey = material.customProgramCacheKey
  material.onBeforeCompile = (s, r) => {
    prev.call(material, s, r)
    // declared at the very top: the fade wrapper puts its own code (inside #if blocks) around main()
    s.vertexShader = 'varying vec3 vStrataWorld;\n' + s.vertexShader
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vStrataWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    s.fragmentShader = 'varying vec3 vStrataWorld;\n' + s.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${DISCARD}`)
  }
  material.customProgramCacheKey = () => `${prevKey.call(material)}|strata-gap`
  material.needsUpdate = true
}
