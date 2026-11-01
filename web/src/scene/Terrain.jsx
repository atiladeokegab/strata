import { Suspense, use, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import { LITE } from './look/tier'

// Google Photorealistic 3D Tiles own the ground when they are streaming and LiDAR is off; optional, like Buildings.jsx.
const google = Object.values(import.meta.glob('./google/state.js', { eager: true }))[0]
export const useGoogleShown = google?.useGoogleShown ?? (() => false)

const BASE = '/terrain/tower-bridge/'
let cache

// Loads meta.json and decodes height.png (RGB 16-bit, see scripts/terrain/build.py) once per page.
export function loadTerrain() {
  cache ??= (async () => {
    const meta = await (await fetch(BASE + 'meta.json')).json()
    const blob = await (await fetch(BASE + 'height.png')).blob()
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bmp, 0, 0)
    const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    const scale = (meta.max_h - meta.min_h) / 65535
    const heights = new Float32Array(bmp.width * bmp.height)
    for (let i = 0; i < heights.length; i++) heights[i] = meta.min_h + (px[i * 4] * 256 + px[i * 4 + 1]) * scale
    return { meta, heights, w: bmp.width, h: bmp.height }
  })()
  return cache
}

export const useTerrain = () => use(loadTerrain())

// Scene frame: metres, origin at the deck centre (meta.origin_osgb, meta.origin_h), x east, y up, z south.
function grid({ meta, heights, w, h }, step) {
  const [minE, , , maxN] = meta.bbox_osgb
  const [oE, oN] = meta.origin_osgb
  const cols = Math.floor((w - 1) / step) + 1
  const rows = Math.floor((h - 1) / step) + 1
  const pos = new Float32Array(cols * rows * 3)
  const uv = new Float32Array(cols * rows * 2)
  let k = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++, k++) {
      const i = r * step, j = c * step
      pos[k * 3] = minE + 0.5 + j - oE
      pos[k * 3 + 1] = heights[i * w + j] - meta.origin_h
      pos[k * 3 + 2] = oN - (maxN - 0.5 - i)
      uv[k * 2] = (j + 0.5) / w
      uv[k * 2 + 1] = 1 - (i + 0.5) / h
    }
  }
  return { pos, uv, cols, rows }
}

/** Ground height (scene y) at scene x, z, bilinear on the 1 m grid; null outside the tile. */
export function heightAt({ meta, heights, w, h }, x, z) {
  const [minE, , , maxN] = meta.bbox_osgb
  const [oE, oN] = meta.origin_osgb
  const j = x + oE - minE - 0.5, i = z - oN + maxN - 0.5
  if (!(j >= 0 && i >= 0 && j <= w - 1 && i <= h - 1)) return null
  const j0 = Math.min(Math.floor(j), w - 2), i0 = Math.min(Math.floor(i), h - 2)
  const fj = j - j0, fi = i - i0, k = i0 * w + j0
  const top = heights[k] * (1 - fj) + heights[k + 1] * fj
  const bot = heights[k + w] * (1 - fj) + heights[k + w + 1] * fj
  return top * (1 - fi) + bot * fi - meta.origin_h
}

const noRaycast = () => {}

// Ray-marches the heightfield instead of testing 4.5M triangles: pointer events and walk mode stay cheap.
const _inv = new THREE.Matrix4(), _ray = new THREE.Ray(), _p = new THREE.Vector3()
function heightfieldRaycast(t) {
  return function (raycaster, hits) {
    _ray.copy(raycaster.ray).applyMatrix4(_inv.copy(this.matrixWorld).invert())
    const { origin: o, direction: d } = _ray
    const above = (s) => { const g = heightAt(t, o.x + d.x * s, o.z + d.z * s); return g === null ? null : o.y + d.y * s - g }
    const far = Math.min(raycaster.far, 4000)
    let prev = raycaster.near, prevAbove = above(prev)
    for (let s = prev + 1; s <= far + 1; s += 1) {
      const cur = Math.min(s, far), a = above(cur)
      if (a !== null && a <= 0 && prevAbove !== null) {
        let lo = prev, hi = cur
        for (let n = 0; n < 10; n++) { const m = (lo + hi) / 2; if (above(m) > 0) lo = m; else hi = m }
        _p.copy(d).multiplyScalar(hi).add(o).applyMatrix4(this.matrixWorld)
        const distance = raycaster.ray.origin.distanceTo(_p)
        if (distance >= raycaster.near && distance <= raycaster.far) hits.push({ distance, point: _p.clone(), object: this })
        return
      }
      prev = cur; prevAbove = a
      if (cur === far) return
    }
  }
}

// Invisible stand-in that answers raycasts for both looks (a Points cloud is not a mesh to walk on).
function Ground() {
  const t = useTerrain()
  const raycast = useMemo(() => heightfieldRaycast(t), [t])
  return <mesh name="terrain-ground" raycast={raycast} frustumCulled={false}><bufferGeometry /></mesh>
}

// Aerial imagery only sees roofs, so draped walls smear into streaks. On steep faces, swap to a
// blurred sample of the imagery (a far mip) toned toward London stone, which reads as a clean facade.
function facades(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vUp;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvUp = normal.y;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vUp;')
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float wall = 1.0 - smoothstep(0.35, 0.7, vUp);
      vec3 blur = texture2D(map, vMapUv, 5.0).rgb;
      vec3 facade = mix(blur, vec3(0.42, 0.39, 0.34), 0.3) * 0.8;
      diffuseColor.rgb = mix(diffuseColor.rgb, facade, wall);`,
    )
}

function TerrainMesh({ step }) {
  const t = useTerrain()
  const gl = useThree((s) => s.gl)
  const geometry = useMemo(() => {
    const { pos, uv, cols, rows } = grid(t, step)
    const idx = new Uint32Array((cols - 1) * (rows - 1) * 6)
    let n = 0
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1
        idx.set([a, d, b, b, d, e], n)
        n += 6
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }, [t, step])
  const old = useStore((s) => s.year < 1950) // before 1950 the ground is the OS 1893-96 London Town Plan (NLS)
  const maps = useMemo(() => ['color.jpg', 'color-1890s.jpg'].map((f) => {
    const tex = new THREE.TextureLoader().load(BASE + f) // both up front, so the year scrub swaps without a blank frame
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = gl.capabilities.getMaxAnisotropy()
    return tex
  }), [gl])
  const map = maps[old ? 1 : 0]
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh name="terrain" geometry={geometry} raycast={noRaycast} castShadow receiveShadow>
      <meshStandardMaterial map={map} roughness={0.92} metalness={0} onBeforeCompile={facades} customProgramCacheKey={() => 'terrain-facades'} />
    </mesh>
  )
}

// Height ramp for the LiDAR look: deep blue at the river, through cyan and green, to warm white on the towers.
const RAMP = ['#0b1d4d', '#1565c0', '#00bcd4', '#43e97b', '#f9d423', '#ff6b35', '#fff4e6'].map((c) => new THREE.Color(c))

function LidarPoints({ step }) {
  const t = useTerrain()
  const geometry = useMemo(() => {
    const { pos } = grid(t, step)
    const col = new Float32Array(pos.length)
    const lo = t.meta.water_h - t.meta.origin_h, span = 60
    const c = new THREE.Color()
    for (let k = 0; k < pos.length; k += 3) {
      const f = Math.min(Math.max((pos[k + 1] - lo) / span, 0), 1) ** 0.7 * (RAMP.length - 1)
      const i = Math.min(Math.floor(f), RAMP.length - 2)
      c.lerpColors(RAMP[i], RAMP[i + 1], f - i).toArray(col, k)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.computeBoundingSphere()
    return g
  }, [t, step])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <points name="terrain-lidar" geometry={geometry} raycast={noRaycast}>
      <pointsMaterial vertexColors size={step * 1.1} sizeAttenuation toneMapped={false} />
    </points>
  )
}

/** Real EA 1 m LiDAR DSM of Tower Bridge with aerial imagery draped. `lidar` swaps to a height-coloured point cloud. */
export default function Terrain({ lidar = false, step = LITE ? 2 : 1 }) {
  const google = useGoogleShown(lidar)
  return (
    <Suspense fallback={null}>
      {lidar ? <LidarPoints step={step} /> : !google && <TerrainMesh step={step} />}{/* Ground stays: walk mode stands on it */}
      <Ground />
    </Suspense>
  )
}

export { Terrain }
