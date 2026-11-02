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
import { ENV_ROTATION, HAZE, HDRI, SKY_JPG, SUN_COLOR, SUN_DIR, eraWeights } from './look/sun'
import { loadPhotos, pbr, warmMaterialTextures } from './look/textures'
import { LITE } from './look/tier'
import { useStore } from '../store'
import { worldUVs } from './look/uvs'
import { bigSilhouette, farHide, smallBridgeMesh } from './look/silhouette'
import { frameNo } from './look/cadence'

const Grade = lazy(() => import('./look/Grade.jsx'))
const ENV_INTENSITY = 0.6

// Per-era air, blended by the (damped) year: coal smoke to ~1910, wartime overcast around 1940, clear from
// ~1960. Fog, a haze dome over the sky, sun and sky light only, so no extra passes. Fog is FogExp2 from the
// camera, eased off above 300 m so the top-down view still sees the ground: 1890 k 0.0013 (90% at 1.17 km,
// 99% at 1.65 km), 1940 k 0.0014 (90% at 1.08 km, 99% at 1.53 km), today 0.00028.
const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace)
const ERAS = [ // fog density and colour (linear), haze over the sky 0..1, sun colour, sun and sky-light intensity
  { fog: 0.0013, color: lin(0.6, 0.5, 0.37), haze: 0.85, sun: new THREE.Color('#ffa866'), sunI: 2.8, envI: 0.5 },
  { fog: 0.0014, color: lin(0.52, 0.55, 0.58), haze: 0.95, sun: new THREE.Color('#dfe5ec'), sunI: 1.7, envI: 0.75 },
  { fog: 0.00028, color: HAZE, haze: 0, sun: new THREE.Color(SUN_COLOR), sunI: 3.4, envI: ENV_INTENSITY },
]
const ease = THREE.MathUtils.smoothstep
const air = { sun: new THREE.Color(SUN_COLOR), sunI: 3.4 } // written by Atmosphere, read by Sun
const _t = new THREE.Color()

function Atmosphere() {
  const scene = useThree((s) => s.scene)
  const y = useRef(useStore.getState().year)
  const dome = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 32, 16)
    const p = g.attributes.position, a = new Float32Array(p.count * 4)
    for (let i = 0; i < p.count; i++) a.set([1, 1, 1, 1 - 0.55 * ease(p.getY(i), 0, 0.5)], i * 4) // thickest at the horizon
    g.setAttribute('color', new THREE.BufferAttribute(a, 4))
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false })
    const d = new THREE.Mesh(g, m)
    Object.assign(d, { frustumCulled: false, renderOrder: -1, raycast: () => null })
    d.scale.setScalar(4000)
    d.userData.noShadow = true
    return d
  }, [])
  useEffect(() => () => { dome.geometry.dispose(); dome.material.dispose() }, [dome])
  useFrame(({ camera }, dt) => {
    const w = eraWeights((y.current = THREE.MathUtils.damp(y.current, useStore.getState().year, 3, dt)))
    const fog = scene.fog
    if (!fog) return
    let k = 0, haze = 0, env = 0
    fog.color.setRGB(0, 0, 0)
    air.sun.setRGB(0, 0, 0)
    air.sunI = 0
    ERAS.forEach((e, i) => {
      k += w[i] * e.fog
      haze += w[i] * e.haze
      env += w[i] * e.envI
      air.sunI += w[i] * e.sunI
      fog.color.add(_t.copy(e.color).multiplyScalar(w[i]))
      air.sun.add(_t.copy(e.sun).multiplyScalar(w[i]))
    })
    const today = ERAS[2].fog
    fog.density = today + (k - today) * Math.min(1, 300 / Math.max(camera.position.y, 1))
    scene.environmentIntensity = env
    dome.visible = haze > 0.01
    dome.material.color.copy(fog.color)
    dome.material.opacity = haze
    dome.position.copy(camera.position)
  })
  return <primitive object={dome} />
}

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

// One directional sun. Only the bridge (and its traffic) casts, so the orthographic shadow box is fitted to
// the bridge's bounds, whatever the camera does: 4096 over ~300 m is ~7 cm texels. Snapped to texels.
const _focus = new THREE.Vector3()
const _box = new THREE.Box3()
const _ball = new THREE.Sphere()
const _right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize()
const _up = new THREE.Vector3().crossVectors(SUN_DIR, _right).normalize()
const SHADOW_EVERY = LITE ? 3 : 2
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
  const gl = useThree((s) => s.gl)
  useEffect(() => () => { gl.shadowMap.autoUpdate = true }, [gl]) // if Look goes, the stand-in light updates its own map
  const scene = useThree((s) => s.scene)
  const bridge = useRef(null)
  useFrame(({ clock }) => {
    // The shadow pass runs every SHADOW_EVERY frames (bascules and traffic move); the light moves only on
    // those frames, so receivers never read a stale map.
    gl.shadowMap.autoUpdate = false
    light.current.color.copy(air.sun)
    light.current.intensity = air.sunI
    const n = frameNo(gl, clock.elapsedTime)
    if (n % SHADOW_EVERY) return // even frames; the mirror takes the odd ones
    // bounds every ~2 s: bascules lift; a new bridge (era change) is picked up here too
    if (!bridge.current?.parent || n % 120 < SHADOW_EVERY) {
      bridge.current = scene.getObjectByName('tower-bridge') ?? null
      if (!bridge.current) return
      _box.setFromObject(bridge.current).getBoundingSphere(_ball)
    }
    gl.shadowMap.needsUpdate = true
    const l = light.current
    _focus.copy(_ball.center)
    // half-width of the shadow box, in sqrt(2) steps so it only resizes occasionally; capped in case a
    // parked instance stretches the bounds
    const half = Math.pow(Math.SQRT2, Math.ceil(Math.log(THREE.MathUtils.clamp(_ball.radius, 30, 400)) / Math.log(Math.SQRT2)))
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

// The first lit frame with the bridge in it (two rendered, so it has settled): tell the shell (its loading
// card), then start the photo textures and the procedural warm-up, never before that frame.
function FirstFrame() {
  const scene = useThree((s) => s.scene)
  const n = useRef(0)
  useFrame(() => {
    if (n.current > 2 || (!n.current && !scene.getObjectByName('tower-bridge'))) return
    if (++n.current === 3) {
      useStore.getState().setSceneReady?.(true)
      loadPhotos()
      warmMaterialTextures()
    }
  })
  return null
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
const _hsl = {}

function kindOf(m) {
  const k = m?.userData?.kind
  if (!KINDS[k] || m.map || m.metalness >= 0.9) return null // keep gold, brass and anything already textured
  // lightness in sRGB, as the hex in geom.js is written: portland #c7beab is 0.73, granite #93908b 0.56
  // (read in linear, the default, portland was 0.49 and every tower got the granite set)
  if (k === 'stone' && m.color.getHSL(_hsl, THREE.SRGBColorSpace).l < 0.65) return KINDS.granite
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

// Meshes load late (terrain, bridge), so once a second opt new meshes into shadows and textures.
// Only the bridge's big silhouettes cast (look/silhouette.js: the shadow pass stays small); a mesh can opt out with userData.noShadow, and
// transparent ones (water, glass) only receive.
// R3F resets gl.shadowMap.enabled to the Canvas `shadows` prop on every Canvas re-render, so re-assert it here.
function SceneUpgrades() {
  const { scene, gl } = useThree()
  const next = useRef(0)
  const stamp = useRef(1)
  const small = useRef([]) // LITE: the bridge's small meshes, refreshed with the once-a-second pass
  useFrame(({ clock, camera }) => {
    if (LITE) farHide(camera, small.current)
    if (!gl.shadowMap.enabled) {
      gl.shadowMap.enabled = true
      gl.shadowMap.type = THREE.PCFSoftShadowMap
      gl.shadowMap.needsUpdate = true
      stamp.current++
      next.current = 0
    }
    // once a second, not every N frames: on a slow device a new terrain tile would cast for N frames
    if (clock.elapsedTime < next.current) return
    next.current = clock.elapsedTime + 1
    const found = []
    scene.traverse((o) => {
      if (!o.isMesh) return
      if (LITE && smallBridgeMesh(o)) found.push(o)
      // owners set castShadow in their props, and a prop change (terrain's bare toggle) sets it again
      if (o.castShadow && !o.userData.noShadow && !bigSilhouette(o)) o.castShadow = false
      if (o.userData.lookShadow === stamp.current) return
      o.userData.lookShadow = stamp.current
      texture(o)
      if (o.userData.noShadow) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      o.receiveShadow = true
      o.castShadow = bigSilhouette(o) && !mats.some((m) => m?.transparent) // terrain, OSM, tiles, small bridge parts: receive only
      mats.forEach((m) => m && (m.needsUpdate = true)) // shadow flags change the compiled shader
    })
    small.current = found
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
  const { scene, gl, setDpr, get } = useThree()
  const [low, setLow] = useState(false)
  const post = useMemo(() => canPost(gl), [gl])
  // shot and profiling scripts (?capture=1): the renderer and the r3f state, for per-pass draw counts
  useEffect(() => { if (new URLSearchParams(location.search).has('capture')) window.__strataGL = { gl, get } }, [gl, get])

  useLayoutEffect(() => {
    const fog = scene.fog
    scene.fog = new THREE.FogExp2(HAZE, 0.00028)
    return () => { scene.fog = fog }
  }, [scene])

  useEffect(() => { if (low) setDpr(1); else if (LITE) setDpr(Math.min(window.devicePixelRatio, 1.5)) }, [low, setDpr])

  return (
    <>
      <PerformanceMonitor onDecline={() => setLow(true)} flipflops={3} onFallback={() => setLow(true)} />
      <InstantSky />
      <Later name="Look sky"><SkyBackground /></Later>
      {/* Image-based light and reflections from the HDRI itself. */}
      <Later name="Look HDRI"><Environment files={HDRI} environmentIntensity={ENV_INTENSITY} environmentRotation={[0, ENV_ROTATION, 0]} /></Later>
      <Sun mapSize={low || !post ? 2048 : 4096} />
      <SceneUpgrades />
      <Atmosphere />
      <FirstFrame />
      {post && <Later name="Look post"><Grade low={low} /></Later>}
    </>
  )
}

export default Look
