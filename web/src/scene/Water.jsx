import { Suspense, use, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Water as WaterSurface } from 'three/examples/jsm/objects/Water.js'
import { BARE, ERA, hazeAt, loadLow } from './Terrain.jsx'
import { riverFootprint } from './riverFootprint.js'
import { SUN_COLOR, SUN_DIR } from './look/sun.js'
import { LITE } from './look/tier'
import { frameNo } from './look/cadence'
import { bigSilhouette } from './look/silhouette'

// The mirror reflects the bridge, its traffic and craft, the sky and a coarse ground (Terrain.jsx 'terrain-mirror',
// hidden from every other pass). Skipped: both full terrain tiles and the city, whose warped bank reflections nobody
// misses (they were ~40% of a desktop frame), and Google's tiles (bridge and sky only when they show). The bridge shows only its big
// silhouettes (look/silhouette.js): traffic, cabins and small parts stay out. Each flipped object is flipped back after.
const MIRROR_SKIP = new Set(['terrain', 'terrain-near', 'osm-buildings', 'landmarks', 'TilesRenderer.TilesGroup'])
function flipForMirror(o, out) {
  for (const c of o.children) {
    if (MIRROR_SKIP.has(c.name)) { if (c.visible) { c.visible = false; out.push(c) } }
    else if (c.name === 'terrain-mirror') { if (!c.visible) { c.visible = true; out.push(c) } }
    else if (c.name === 'tower-bridge') c.traverseVisible((m) => { if (m.isMesh && !bigSilhouette(m)) { m.visible = false; out.push(m) } })
    else flipForMirror(c, out)
  }
  return out
}

function Surface({ sun }) {
  const low = use(loadLow()) // the first-load 4 m ground every device already has
  const fog = useThree((s) => s.scene.fog)
  const water = useMemo(() => {
    const { meta } = low
    // only over the river itself, whatever ground (ours or Google's) shows around it; three's Water wants its
    // surface in the local xy plane (normal +z), turned flat below, so the grid frame's (x, z) goes in as (x, -z)
    const { positions, index } = riverFootprint(low)
    const geom = new THREE.BufferGeometry()
    const xy = new Float32Array(positions.length)
    for (let i = 0; i < xy.length; i += 3) { xy[i] = positions[i]; xy[i + 1] = -positions[i + 2] }
    geom.setAttribute('position', new THREE.BufferAttribute(xy, 3))
    geom.setIndex(index)
    geom.computeVertexNormals()
    const at = (m) => {
      m.name = 'thames'
      m.rotation.x = -Math.PI / 2
      m.position.y = meta.water_h - meta.origin_h // the river surface, in the bridge frame (y = 0 is the deck)
      m.receiveShadow = true
      return m
    }
    // phones: no mirror pass at all, a plain glossy river
    if (LITE) return at(new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x2c3b34, roughness: 0.3, metalness: 0 })))
    const normals = new THREE.TextureLoader().load('/terrain/waternormals.jpg', (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
    })
    const w = new WaterSurface(geom, {
      textureWidth: 512, // a rippled, dimmed reflection: half resolution reads the same
      textureHeight: 512,
      waterNormals: normals,
      sunColor: SUN_COLOR,
      waterColor: 0x2c3b34, // the Thames is a muddy green-grey, not a pool blue
      distortionScale: 0.12, // reflections wobble, they do not shatter
      alpha: 1,
      fog: !!fog,
    })
    w.material.uniforms.size.value = 4 // broad, slow swell: fine ripples alias into grey noise near the camera
    // the stock shader mirrors a bright sky into a white sheet; a murky tidal river reflects far less
    w.material.fragmentShader = w.material.fragmentShader
      .replace('float rf0 = 0.3;', 'float rf0 = 0.04;')
      .replace('reflectionSample * 0.9', 'reflectionSample * 0.4')
      .replace('noise.xzy * vec3( 1.5, 1.0, 1.5 )', 'noise.xzy * vec3( 0.35, 1.0, 0.35 )') // calm water: flatten the summed normals
      // the ground's haze, so the river fades into it with the land instead of ending in a line at the tile's edge
      .replace('varying vec4 worldPosition;', 'varying vec4 worldPosition;\nuniform float uEra;\nuniform float uBare;')
      .replace('#include <fog_fragment>', `#include <fog_fragment>\n#ifdef USE_FOG\n${hazeAt('worldPosition.xz')}\n#endif`)
    Object.assign(w.material.uniforms, { uEra: ERA, uBare: BARE })
    // three's Water re-renders the whole scene into its mirror before every render call that draws it (each
    // post-processing pass is one), so one frame cost ~22 passes; render the mirror on the first call of every 2nd frame
    const mirror = w.onBeforeRender
    w.onBeforeRender = function (renderer, scene, ...a) {
      if (!this.userData.armed) return
      this.userData.armed = false
      const flipped = flipForMirror(scene, [])
      try { mirror.call(this, renderer, scene, ...a) } finally { for (const o of flipped) o.visible = !o.visible }
    }
    return at(w)
  }, [low, fog])
  useEffect(() => { water.material.uniforms?.sunDirection.value.set(...sun).normalize() }, [water, sun[0], sun[1], sun[2]]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { water.geometry.dispose(); water.material.dispose() }, [water])
  useFrame(({ clock, gl }, dt) => {
    if (!water.material.uniforms) return
    water.material.uniforms.time.value += dt * 0.35
    water.userData.armed = frameNo(gl, clock.elapsedTime) % 2 === 1 // odd frames: the shadow map takes the even ones
  })
  return <primitive object={water} />
}

const SUN = SUN_DIR.toArray() // the Look's sun, so the glints sit under the real light

/** The Thames at the LiDAR water level, with slow animated reflections. `sun` should match the scene's key light.
 * Also over Google's tiles: their river (y about -13.5, google/frame.js) sits 2.3 m below ours, so ours wins by depth,
 * and their banks, above the water line, still hide it. */
export default function Water({ sun = SUN }) {
  return <Suspense fallback={null}><Surface sun={sun} /></Suspense>
}

export { Water }
