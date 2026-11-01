// Adapted from Mechanica (MIT, github.com/Caleb0796/mechanica): light rig, ACES grade and haze from its scene environment.
// The scene's look: physical sky and sun, image-based light, camera-fitted soft shadows, haze, and the
// post stack (AO, bloom, ACES, period grade by year, vignette, SMAA). Mount once inside the R3F <Canvas>.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, PerformanceMonitor, Sky } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { BrightnessContrastEffect, HueSaturationEffect, SepiaEffect, ToneMappingMode, VignetteEffect } from 'postprocessing'
import * as THREE from 'three'
import { useStore } from '../store'
import { HAZE, SKY, SUN_COLOR, SUN_DIR, periodGrade } from './look/sun'
import { warmMaterialTextures } from './look/textures'

const SUN_POS = SUN_DIR.clone().multiplyScalar(1000)
const FILL_POS = [-SUN_DIR.x * 1000, 400, -SUN_DIR.z * 1000]

// The visible sky follows the camera so it reads as infinitely far at every zoom (20 m to 1.5 km and beyond).
function FollowSky() {
  const sky = useRef()
  useFrame(({ camera }) => sky.current?.position.copy(camera.position))
  return <Sky ref={sky} distance={1000} sunPosition={SUN_POS} {...SKY} />
}

// One directional sun whose orthographic shadow box is fitted to what the camera is looking at: tight and
// crisp when walking at 20 m, wide when hovering at 1.5 km. Snapped to shadow texels so it does not shimmer.
const _dir = new THREE.Vector3()
const _focus = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
function Sun({ mapSize }) {
  const light = useRef()
  const last = useRef(0)
  useMemo(() => {
    _right.crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize()
    _up.crossVectors(SUN_DIR, _right).normalize()
  }, [])
  useFrame(({ camera }) => {
    const l = light.current
    if (!l) return
    camera.getWorldDirection(_dir)
    const h = Math.max(camera.position.y, 2)
    const t = _dir.y < -0.02 ? Math.min(h / -_dir.y, 2000) : Math.min(h * 4, 2000)
    _focus.copy(camera.position).addScaledVector(_dir, t)
    const dist = camera.position.distanceTo(_focus)
    // half-width of the shadow box, in sqrt(2) steps so it only resizes occasionally
    const half = Math.pow(Math.SQRT2, Math.ceil(Math.log(THREE.MathUtils.clamp(dist * 0.9, 30, 1800)) / Math.log(Math.SQRT2)))
    const texel = (2 * half) / mapSize
    const r = Math.round(_focus.dot(_right) / texel) * texel
    const u = Math.round(_focus.dot(_up) / texel) * texel
    const d = _focus.dot(SUN_DIR)
    _focus.copy(_right).multiplyScalar(r).addScaledVector(_up, u).addScaledVector(SUN_DIR, d)
    l.target.position.copy(_focus)
    l.target.updateMatrixWorld()
    l.position.copy(_focus).addScaledVector(SUN_DIR, 3000)
    if (half !== last.current) {
      last.current = half
      const c = l.shadow.camera
      c.left = c.bottom = -half
      c.right = c.top = half
      c.near = 1
      c.far = 6000
      c.updateProjectionMatrix()
      l.shadow.normalBias = texel * 1.2
    }
  })
  return (
    <directionalLight
      ref={light}
      color={SUN_COLOR}
      intensity={4.5}
      castShadow
      shadow-mapSize={[mapSize, mapSize]}
      shadow-bias={-0.0003}
      shadow-radius={3}
    />
  )
}

// Meshes load late (terrain, bridge), so every second opt any new mesh into shadows.
// A mesh can opt out with userData.noShadow; transparent ones (water, glass) only receive.
// R3F resets gl.shadowMap.enabled to the Canvas `shadows` prop on every Canvas re-render, so re-assert it here.
function ShadowFlags() {
  const { scene, gl } = useThree()
  const n = useRef(0)
  const stamp = useRef(1)
  useFrame(() => {
    if (!gl.shadowMap.enabled) {
      gl.shadowMap.enabled = true
      gl.shadowMap.type = THREE.PCFSoftShadowMap
      gl.shadowMap.needsUpdate = true
      stamp.current++
      n.current = 0
    }
    if (n.current++ % 60) return
    scene.traverse((o) => {
      if (!o.isMesh || o.userData.lookShadow === stamp.current || o.userData.noShadow) return
      o.userData.lookShadow = stamp.current
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      o.receiveShadow = true
      o.castShadow = !mats.some((m) => m?.transparent)
      mats.forEach((m) => m && (m.needsUpdate = true)) // shadow flags change the compiled shader
    })
  })
  return null
}

// Year drives the grade continuously, damped so scrubbing the timeline eases between periods.
// The grade effects are plain objects mutated per frame: the r3f wrappers rebuild on every prop change, and
// under React 19 a ref passed to them lands in their JSON.stringify'd props and throws.
function Grade({ low }) {
  const fx = useMemo(() => ({
    sat: new HueSaturationEffect(),
    bc: new BrightnessContrastEffect(),
    sepia: new SepiaEffect({ intensity: 0 }),
    vig: new VignetteEffect({ offset: 0.32, darkness: 0.42 }),
  }), [])
  useEffect(() => () => Object.values(fx).forEach((e) => e.dispose()), [fx])
  const k = useRef(periodGrade(useStore.getState().year))
  useFrame((_, dt) => {
    const p = (k.current = THREE.MathUtils.damp(k.current, periodGrade(useStore.getState().year), 4, dt))
    fx.sat.saturation = -0.08 - 0.32 * p
    fx.sepia.intensity = 0.42 * p
    fx.bc.contrast = 0.06 - 0.04 * p
    fx.bc.brightness = 0.01 * p
    fx.vig.darkness = 0.42 + 0.18 * p
  })
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {!low && <N8AO halfRes aoRadius={6} distanceFalloff={1} intensity={2.2} quality="medium" />}
      <Bloom mipmapBlur intensity={0.35} luminanceThreshold={0.92} luminanceSmoothing={0.15} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={fx.sat} dispose={null} />
      <primitive object={fx.bc} dispose={null} />
      <primitive object={fx.sepia} dispose={null} />
      <primitive object={fx.vig} dispose={null} />
      <SMAA />
    </EffectComposer>
  )
}

export function Look() {
  const { scene, setDpr } = useThree()
  const [low, setLow] = useState(false)

  useLayoutEffect(() => {
    const fog = scene.fog
    scene.fog = new THREE.FogExp2(HAZE, 0.00022)
    return () => { scene.fog = fog }
  }, [scene])

  useEffect(() => { if (low) setDpr(1) }, [low, setDpr])
  useEffect(() => warmMaterialTextures(), [])

  return (
    <>
      <PerformanceMonitor onDecline={() => setLow(true)} flipflops={3} onFallback={() => setLow(true)} />
      <FollowSky />
      {/* Reflections and ambient light come from the same sky, baked once into a small cubemap. */}
      <Environment frames={1} resolution={128} environmentIntensity={0.4}>
        <Sky distance={500} sunPosition={SUN_POS} {...SKY} />
      </Environment>
      {/* Light rig adapted from Mechanica's "dusk-west" rig (MIT): warm low key, cool sky fill from the opposite side. */}
      <hemisphereLight args={['#9fb9cc', '#35271c', 0.28]} />
      <directionalLight color="#9fc7da" intensity={0.6} position={FILL_POS} />
      <Sun mapSize={low ? 2048 : 4096} />
      <ShadowFlags />
      <Grade low={low} />
    </>
  )
}

export default Look
