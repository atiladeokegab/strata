// Adapted from Mechanica (MIT, github.com/Caleb0796/mechanica): ACES grade, haze and procedural PBR textures.
// The scene's look: a Poly Haven HDRI sky (CC0) that also lights and reflects the scene, a sun matched to it
// with camera-fitted soft shadows, haze, world-scale textures on the bridge, and the post stack
// (N8AO, bloom, ACES, period grade by year, vignette, SMAA). Mount once inside the R3F <Canvas>.
import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, PerformanceMonitor, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { Guard } from '../ui/slots'
import { makeLowEnv } from './look/envLow'
import { ENV_ROTATION, HAZE, HDRI, SKY_JPG, SUN_COLOR, SUN_DIR } from './look/sun'
import { pbr, warmMaterialTextures } from './look/textures'
import { LITE } from './look/tier'
import { worldUVs } from './look/uvs'

const Grade = lazy(() => import('./look/Grade.jsx'))
const ENV_INTENSITY = 0.6

// First frame: a 32x16 copy of the HDRI (inlined, no fetch) lights and fills the sky at once, with the HDRI's
// energy, so the bridge is never a black silhouette on a blank sky while the HDR, the sky JPG and the post
// stack load. Each later layer replaces it in place.
function InstantSky() {
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    const env = makeLowEnv()
    const prev = [scene.environment, scene.background, scene.environmentIntensity]
    scene.environment = scene.background = env
    scene.environmentIntensity = ENV_INTENSITY
    scene.environmentRotation.set(0, ENV_ROTATION, 0)
    scene.backgroundRotation.set(0, ENV_ROTATION, 0)
    return () => { [scene.environment, scene.background, scene.environmentIntensity] = prev; env.dispose() }
  }, [scene])
  return null
}

// A layer that streams in after the first frame; if it fails, the instant sky stays.
const Later = ({ name, children }) => <Guard name={name} fallback={null}><Suspense fallback={null}>{children}</Suspense></Guard>

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
// tile omitted: the photo's real-world size (look/textures.js tileMetres), on our metre UVs
const KINDS = {
  stone: { variant: 'stone:portland' },
  granite: { variant: 'granite:cornish' },
  slate: { variant: 'slate:roof' },
  steel: { variant: 'steel:blue', metalness: 0.05 }, // paint is a dielectric
  trim: { variant: 'steel:white', metalness: 0.05 },
  iron: { variant: 'iron:cast', tile: 3 },
  road: { variant: 'asphalt' },
  timber: { variant: 'wood:dark' },
  brick: { variant: 'brick:london' },
}
const _c = new THREE.Color()

function kindOf(m) {
  const k = m?.userData?.kind
  if (!KINDS[k] || m.map || m.metalness >= 0.9) return null // keep gold, brass and anything already textured
  if (k === 'stone' && m.color.getHSL({}).l < 0.7) return KINDS.granite
  return KINDS[k]
}

function texture(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  let uv = false
  for (const m of mats) {
    const k = kindOf(m)
    if (!k) continue
    uv = true
    const { map, normalMap, normalScale, roughnessMap } = pbr(k.variant, k.tile && 1 / k.tile, true)
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
      <InstantSky />
      <Later name="Look sky"><SkyBackground /></Later>
      {/* Image-based light and reflections from the HDRI itself. */}
      <Later name="Look HDRI"><Environment files={HDRI} environmentIntensity={ENV_INTENSITY} environmentRotation={[0, ENV_ROTATION, 0]} /></Later>
      <Sun mapSize={low || !post ? 2048 : 4096} />
      <SceneUpgrades />
      {post && <Later name="Look post"><Grade low={low} /></Later>}
    </>
  )
}

export default Look
