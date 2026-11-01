import { Suspense, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Water as WaterSurface } from 'three/examples/jsm/objects/Water.js'
import { useStore } from '../store'
import { useGoogleShown, useTerrainMeta } from './Terrain.jsx'
import { SUN_COLOR, SUN_DIR } from './look/sun.js'
import { LITE } from './look/tier'

function Surface({ sun }) {
  const meta = useTerrainMeta()
  const fog = useThree((s) => s.scene.fog)
  const water = useMemo(() => {
    const [minE, minN, maxE, maxN] = meta.bbox_osgb
    const [oE, oN] = meta.origin_osgb
    const geom = new THREE.PlaneGeometry(maxE - minE, maxN - minN)
    const at = (m) => {
      m.name = 'thames'
      m.rotation.x = -Math.PI / 2
      // the river surface, in the bridge frame (y = 0 is the deck)
      m.position.set((minE + maxE) / 2 - oE, meta.water_h - meta.origin_h, oN - (minN + maxN) / 2)
      m.receiveShadow = true
      return m
    }
    // phones: no mirror pass at all, a plain glossy river
    if (LITE) return at(new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x2c3b34, roughness: 0.3, metalness: 0 })))
    const normals = new THREE.TextureLoader().load('/terrain/waternormals.jpg', (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
    })
    const w = new WaterSurface(geom, {
      textureWidth: 1024,
      textureHeight: 1024,
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
    // three's Water re-renders the whole scene into its mirror before every render call that draws it (each
    // post-processing pass is one), so one frame cost ~22 passes; render the mirror once a frame, on the first call
    const mirror = w.onBeforeRender
    w.onBeforeRender = function (...a) { if (this.userData.armed) { this.userData.armed = false; mirror.apply(this, a) } }
    return at(w)
  }, [meta, fog])
  useEffect(() => { water.material.uniforms?.sunDirection.value.set(...sun).normalize() }, [water, sun[0], sun[1], sun[2]]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { water.geometry.dispose(); water.material.dispose() }, [water])
  useFrame((_, dt) => {
    if (!water.material.uniforms) return
    water.material.uniforms.time.value += dt * 0.35
    water.userData.armed = true
  })
  return <primitive object={water} />
}

const SUN = SUN_DIR.toArray() // the Look's sun, so the glints sit under the real light

/** The Thames at the LiDAR water level, with slow animated reflections. `sun` should match the scene's key light. */
export default function Water({ sun = SUN }) {
  const lidar = useStore((s) => s.lidar)
  if (useGoogleShown(lidar)) return null // Google's own Thames is showing
  return <Suspense fallback={null}><Surface sun={sun} /></Suspense>
}

export { Water }
