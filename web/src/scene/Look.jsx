// Adapted from Mechanica (MIT, github.com/Caleb0796/mechanica): ACES grade, haze and procedural PBR textures.
// The scene's look: a Poly Haven HDRI sky (CC0) that also lights and reflects the scene, a sun matched to it
// with camera-fitted soft shadows, haze, world-scale textures on the bridge, and the post stack
// (N8AO, bloom, ACES, period grade by year, vignette, SMAA). Mount once inside the R3F <Canvas>.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, PerformanceMonitor, useTexture } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { BrightnessContrastEffect, HueSaturationEffect, SepiaEffect, ToneMappingMode, VignetteEffect } from 'postprocessing'
import * as THREE from 'three'
import { useStore } from '../store'
import { ENV_ROTATION, HAZE, HDRI, SKY_JPG, SUN_COLOR, SUN_DIR, periodGrade } from './look/sun'
import { pbr, warmMaterialTextures } from './look/textures'
import { LITE } from './look/tier'

// The sky: Poly Haven's tonemapped 4k JPG (sharp clouds), rotated with the HDRI so the sun lines up.
function SkyBackground() {
  const scene = useThree((s) => s.scene)
  const tex = useTexture(SKY_JPG)
  useLayoutEffect(() => {
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    const prev = [scene.background, scene.backgroundIntensity]
    scene.background = tex
    scene.backgroundIntensity = 1.15 // the JPG is already tonemapped; this keeps it bright through ACES
    scene.backgroundRotation.set(0, ENV_ROTATION, 0)
    return () => { [scene.background, scene.backgroundIntensity] = prev }
  }, [scene, tex])
  return null
}

// One directional sun whose orthographic shadow box is fitted to what the camera is looking at: tight and
// crisp when walking at 20 m, wide when hovering at 1.5 km. Snapped to shadow texels so it does not shimmer.
const _dir = new THREE.Vector3()
const _focus = new THREE.Vector3()
const _right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize()
const _up = new THREE.Vector3().crossVectors(SUN_DIR, _right).normalize()
function Sun({ mapSize }) {
  const light = useRef()
  const last = useRef(0)
  useEffect(() => {
    // a new map size needs a new shadow map
    const l = light.current
    l.shadow.map?.dispose()
    l.shadow.map = null
    l.shadow.mapSize.set(mapSize, mapSize)
    last.current = 0
  }, [mapSize])
  useFrame(({ camera }) => {
    const l = light.current
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
    l.position.copy(_focus).addScaledVector(SUN_DIR, 2500)
    if (half !== last.current) {
      last.current = half
      const c = l.shadow.camera
      c.left = c.bottom = -half
      c.right = c.top = half
      c.near = 10
      c.far = 5000
      c.updateProjectionMatrix()
      l.shadow.normalBias = texel * 1.5
    }
  })
  return <directionalLight ref={light} color={SUN_COLOR} intensity={3.4} castShadow shadow-bias={-0.00005} shadow-radius={4} />
}

// Bridge materials (tagged by userData.kind in bridge/geom.js) get world-scale texture detail: a grey map
// that keeps the material's own colour, plus normal and roughness maps. tile = metres per texture repeat.
const KINDS = {
  stone: { variant: 'stone:portland', tile: 3.6 },
  granite: { variant: 'granite:cornish', tile: 5 },
  slate: { variant: 'slate:roof', tile: 3 },
  steel: { variant: 'steel:blue', tile: 4, metalness: 0.05 }, // paint is a dielectric
  trim: { variant: 'steel:white', tile: 4, metalness: 0.05 },
  iron: { variant: 'iron:cast', tile: 3 },
  road: { variant: 'asphalt', tile: 6 },
  timber: { variant: 'wood:dark', tile: 2 },
}
const _scale = new THREE.Vector3()
const _c = new THREE.Color()

function kindOf(m) {
  const k = m?.userData?.kind
  if (!KINDS[k] || m.map || m.metalness >= 0.9) return null // keep gold, brass and anything already textured
  if (k === 'stone' && m.color.getHSL({}).l < 0.7) return KINDS.granite
  return KINDS[k]
}

// Box-projected UVs in metres, so one texture scale holds on every part whatever its size.
function worldUVs(mesh) {
  const g = mesh.geometry
  if (g.userData.lookUV || !g.attributes.normal) return
  g.userData.lookUV = true
  mesh.getWorldScale(_scale)
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * _scale.x
    const y = p.getY(i) * _scale.y
    const z = p.getZ(i) * _scale.z
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    if (ax >= ay && ax >= az) (uv[i * 2] = z), (uv[i * 2 + 1] = y)
    else if (ay >= az) (uv[i * 2] = x), (uv[i * 2 + 1] = z)
    else (uv[i * 2] = x), (uv[i * 2 + 1] = y)
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

function texture(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  let uv = false
  for (const m of mats) {
    const k = kindOf(m)
    if (!k) continue
    uv = true
    const { map, normalMap, normalScale, roughnessMap } = pbr(k.variant, 1 / k.tile, true)
    _c.copy(m.color)
    Object.assign(m, { map, normalMap, normalScale, roughnessMap, roughness: 1 })
    if (k.metalness !== undefined) m.metalness = k.metalness
    m.color.copy(_c)
    m.needsUpdate = true
  }
  if (uv) worldUVs(mesh)
}

// Meshes load late (terrain, bridge), so every second opt new meshes into shadows and textures.
// A mesh can opt out with userData.noShadow; transparent ones (water, glass) only receive.
// R3F resets gl.shadowMap.enabled to the Canvas `shadows` prop on every Canvas re-render, so re-assert it here.
function SceneUpgrades() {
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
      if (!o.isMesh || o.userData.lookShadow === stamp.current) return
      o.userData.lookShadow = stamp.current
      texture(o)
      if (o.userData.noShadow) return
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
    vig: new VignetteEffect({ offset: 0.3, darkness: 0.38 }),
  }), [])
  useEffect(() => () => Object.values(fx).forEach((e) => e.dispose()), [fx])
  const k = useRef(periodGrade(useStore.getState().year))
  const ao = useRef()
  useFrame(({ camera }, dt) => {
    // AO grounds things up close; from altitude it only greys the dense LiDAR roofscape, so fade it out
    if (ao.current) ao.current.configuration.intensity = 2.4 * (1 - 0.75 * THREE.MathUtils.smoothstep(camera.position.y, 150, 900))
    const p = (k.current = THREE.MathUtils.damp(k.current, periodGrade(useStore.getState().year), 4, dt))
    fx.sat.saturation = 0.04 - 0.4 * p
    fx.sepia.intensity = 0.42 * p
    fx.bc.contrast = 0.08 - 0.05 * p
    fx.bc.brightness = 0.01 * p
    fx.vig.darkness = 0.38 + 0.2 * p
  })
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {!low && !LITE && <N8AO ref={ao} halfRes aoRadius={4} distanceFalloff={1} intensity={2.4} quality="medium" />}
      <Bloom mipmapBlur intensity={LITE ? 0.15 : 0.3} luminanceThreshold={1} luminanceSmoothing={0.2} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={fx.sat} dispose={null} />
      <primitive object={fx.bc} dispose={null} />
      <primitive object={fx.sepia} dispose={null} />
      <primitive object={fx.vig} dispose={null} />
      <SMAA />
    </EffectComposer>
  )
}

// Software renderers (SwiftShader, llvmpipe) and GPUs without float render targets skip the post stack:
// it renders black or crawls there. Renderer tone mapping (R3F's ACES default) still applies. ?post=1 forces it on.
function canPost(gl) {
  if (new URLSearchParams(location.search).get('post') === '1') return true
  const ctx = gl.getContext()
  const info = ctx.getExtension('WEBGL_debug_renderer_info')
  const name = info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ''
  if (/swiftshader|llvmpipe|softpipe|software/i.test(name)) return false
  return gl.capabilities.isWebGL2 && !!ctx.getExtension('EXT_color_buffer_float')
}

export function Look() {
  const { scene, gl, setDpr } = useThree()
  const [low, setLow] = useState(false)
  const post = useMemo(() => canPost(gl), [gl])

  useLayoutEffect(() => {
    const fog = scene.fog
    scene.fog = new THREE.FogExp2(HAZE, 0.00028)
    return () => { scene.fog = fog }
  }, [scene])

  useEffect(() => { if (low) setDpr(1); else if (LITE) setDpr(Math.min(window.devicePixelRatio, 1.5)) }, [low, setDpr])
  useEffect(() => warmMaterialTextures(), [])

  return (
    <>
      <PerformanceMonitor onDecline={() => setLow(true)} flipflops={3} onFallback={() => setLow(true)} />
      <SkyBackground />
      {/* Image-based light and reflections from the HDRI itself. */}
      <Environment files={HDRI} environmentIntensity={0.6} environmentRotation={[0, ENV_ROTATION, 0]} />
      <Sun mapSize={low || !post ? 2048 : 4096} />
      <SceneUpgrades />
      {post && <Grade low={low} />}
    </>
  )
}

export default Look
