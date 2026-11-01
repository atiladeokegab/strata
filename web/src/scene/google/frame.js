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

// Google's own bridge is cut out so ours stands in the gap: a narrow box along the deck and side spans, and a wider
// one over the piers and towers. Only above the floor, so the tiles' Thames (at about y = -13.5) stays.
export const GAP = { floor: -12, deck: [12, 150], piers: [30, 62] } // [half width x, half length z], m; deck reaches past the shore abutments (Google's stand at 136-143)

const DISCARD = `
  if (vStrataWorld.y > ${GAP.floor.toFixed(1)} && (
    (abs(vStrataWorld.x) < ${GAP.deck[0].toFixed(1)} && abs(vStrataWorld.z) < ${GAP.deck[1].toFixed(1)}) ||
    (abs(vStrataWorld.x) < ${GAP.piers[0].toFixed(1)} && abs(vStrataWorld.z) < ${GAP.piers[1].toFixed(1)}) ||
    (vStrataWorld.x > 14.0 && vStrataWorld.x < 49.5 && vStrataWorld.z > 138.5 && vStrataWorld.z < 171.5))) discard; // our engine house + accumulator (south bank)`

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
