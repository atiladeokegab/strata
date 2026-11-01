import { Suspense, use, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import { bareEarth } from './bareEarth.js'
import { LITE } from './look/tier'

// Google Photorealistic 3D Tiles own the ground when they are streaming and LiDAR is off; optional, like Buildings.jsx.
const google = Object.values(import.meta.glob('./google/state.js', { eager: true }))[0]
export const useGoogleShown = google?.useGoogleShown ?? (() => false)

const BASE = '/terrain/tower-bridge/'
let cache

// Decodes a height.png (RGB 16-bit, see scripts/terrain/build.py) to metres OD.
async function decodeHeights(url, meta) {
  const blob = await (await fetch(url)).blob()
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bmp, 0, 0)
  const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data
  const scale = (meta.max_h - meta.min_h) / 65535
  const heights = new Float32Array(bmp.width * bmp.height)
  for (let i = 0; i < heights.length; i++) heights[i] = meta.min_h + (px[i * 4] * 256 + px[i * 4 + 1]) * scale
  return { heights, w: bmp.width, h: bmp.height }
}

// Loads meta.json and the outer 1 m tile once per page.
export function loadTerrain() {
  cache ??= (async () => {
    const meta = await (await fetch(BASE + 'meta.json')).json()
    const { heights, w, h } = await decodeHeights(BASE + 'height.png', meta)
    // before 1950: the DSM without its modern buildings (see bareEarth.js)
    return { meta, heights, old: bareEarth(heights, w, h), w, h, base: BASE }
  })()
  return cache
}

// Desktop tier: the 600 m near field at 0.5 m with 4096 px drapes (scripts/terrain/near.py). Resolves only
// once its height and both drapes are in, so it never shows a blank square over the outer tile.
let nearCache
function loadNear() {
  nearCache ??= (async () => {
    const t = await loadTerrain()
    const meta = { ...t.meta, bbox_osgb: t.meta.near.bbox_osgb }
    const [{ heights, w, h }, ...maps] = await Promise.all([
      decodeHeights(BASE + 'near/height.png', meta),
      ...['color.jpg', 'color-1890s.jpg'].map((f) => new THREE.TextureLoader().loadAsync(BASE + 'near/' + f)),
    ])
    // bare earth sampled from the outer tile's, so both meshes sink to the same 1890s ground
    const res = (meta.bbox_osgb[2] - meta.bbox_osgb[0]) / w, [minE, , , maxN] = meta.bbox_osgb, [oE, oN] = meta.origin_osgb
    const outerOld = { ...t, heights: t.old }, old = new Float32Array(w * h)
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
      old[i * w + j] = Math.min(heights[i * w + j], heightAt(outerOld, minE + (j + 0.5) * res - oE, oN - (maxN - (i + 0.5) * res)) + meta.origin_h)
    }
    return { meta, heights, old, w, h, base: BASE + 'near/', maps }
  })()
  return nearCache
}

// The near tile, or null: phones and ?lite=1 never fetch it; desktop starts it after the outer tile is up.
function useNear() {
  const [near, setNear] = useState(null)
  useEffect(() => {
    if (LITE) return
    let live = true
    const id = setTimeout(() => loadNear().then((n) => live && n.meta.near && setNear(n)).catch(() => {}), 1500)
    return () => { live = false; clearTimeout(id) }
  }, [])
  return near
}

export const useTerrain = () => use(loadTerrain())

// Scene frame: metres, origin at the deck centre (meta.origin_osgb, meta.origin_h), x east, y up, z south.
function grid({ meta, heights, old, w, h }, step) {
  const [minE, , maxE, maxN] = meta.bbox_osgb
  const [oE, oN] = meta.origin_osgb
  const res = (maxE - minE) / w // metres per pixel: 1 outer, 0.5 near
  const cols = Math.floor((w - 1) / step) + 1
  const rows = Math.floor((h - 1) / step) + 1
  const pos = new Float32Array(cols * rows * 3)
  const uv = new Float32Array(cols * rows * 2)
  const low = new Float32Array(cols * rows)
  let k = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++, k++) {
      const i = r * step, j = c * step
      pos[k * 3] = minE + (j + 0.5) * res - oE
      pos[k * 3 + 1] = heights[i * w + j] - meta.origin_h
      low[k] = old[i * w + j] - meta.origin_h
      pos[k * 3 + 2] = oN - (maxN - (i + 0.5) * res)
      uv[k * 2] = (j + 0.5) / w
      uv[k * 2 + 1] = 1 - (i + 0.5) / h
    }
  }
  return { pos, uv, low, cols, rows }
}

/** Ground height (scene y) at scene x, z, bilinear on the tile's grid; null outside the tile. */
export function heightAt({ meta, heights, w, h }, x, z) {
  const [minE, , maxE, maxN] = meta.bbox_osgb
  const [oE, oN] = meta.origin_osgb
  const res = (maxE - minE) / w
  const j = (x + oE - minE) / res - 0.5, i = (z - oN + maxN) / res - 0.5
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
  const old = useStore((s) => s.year < 1950)
  const raycast = useMemo(() => heightfieldRaycast(old ? { ...t, heights: t.old } : t), [t, old])
  return <mesh name="terrain-ground" raycast={raycast} frustumCulled={false}><bufferGeometry /></mesh>
}

// Aerial imagery only sees roofs, so draped walls smear into streaks. On steep faces, swap to a
// blurred sample of the imagery (a far mip) toned toward London stone, which reads as a clean facade.
// The 1890s OS sheet as an old map: its paper renders as warm #d9c49a stock in full light (the albedo is
// warmer still to offset the blue sky fill, measured on a still) and its ink as dark brown, with a
// little of the sheet's own hue kept (blue water, tinted blocks). The tone runs on gamma-encoded colour
// because the map sample is linear here; ERA_GAIN sets how bright the paper sits under the scene light.
// ERA is 1 while the old map is draped; then the ground is bare earth (aOld), flat-lit.
const ERA = { value: 0 }
const ERA_GAIN = '1.0'
const ERA_GRADE = `
  vec3 eraGrade(vec3 c) {
    vec3 s = pow(max(c, 0.0), vec3(1.0 / 2.2));
    float l = dot(s, vec3(0.3, 0.59, 0.11));
    vec3 tone = mix(vec3(0.30, 0.21, 0.13), vec3(0.957, 0.816, 0.58), smoothstep(0.30, 0.88, l));
    vec3 t = mix(tone, tone * s / max(l, 0.05), 0.35);
    return mix(c, pow(clamp(t, 0.0, 1.0), vec3(2.2)) * ${ERA_GAIN}, uEra);
  }`

function facades(shader) {
  shader.uniforms.uEra = ERA
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vUp;\nuniform float uEra;\nattribute float aOld;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif (uEra > 0.5 && position.y - aOld > 0.3) objectNormal = vec3(0.0, 1.0, 0.0);\nvUp = objectNormal.y;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y = mix(transformed.y, aOld, uEra);')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying float vUp;\nuniform float uEra;${ERA_GRADE}`)
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      diffuseColor.rgb = eraGrade(diffuseColor.rgb);
      float wall = 1.0 - smoothstep(0.35, 0.7, vUp);
      vec3 blur = eraGrade(texture2D(map, vMapUv, 5.0).rgb);
      vec3 facade = mix(blur, vec3(0.42, 0.39, 0.34), 0.3) * 0.8;
      diffuseColor.rgb = mix(diffuseColor.rgb, facade, wall);`,
    )
}

// Scene-space rect [x0, z0, x1, z1] of an OSGB bbox, for cutting the near tile's hole in the outer one.
function rect(meta, [minE, minN, maxE, maxN]) {
  const [oE, oN] = meta.origin_osgb
  return [minE - oE, oN - maxN, maxE - oE, oN - minN]
}
const inside = (p, k, r) => r && p[k * 3] >= r[0] && p[k * 3] <= r[2] && p[k * 3 + 2] >= r[1] && p[k * 3 + 2] <= r[3]

function TerrainMesh({ t, step, hole, name = 'terrain' }) {
  const gl = useThree((s) => s.gl)
  const geometry = useMemo(() => {
    const { pos, uv, low, cols, rows } = grid(t, step)
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
    g.setAttribute('aOld', new THREE.BufferAttribute(low, 1))
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }, [t, step])
  // once the near tile is up, drop the outer cells it covers (only the index changes, so no rebuild hitch)
  useLayoutEffect(() => {
    const full = geometry.index
    if (!hole) return
    const pos = geometry.attributes.position.array, idx = full.array, r = rect(t.meta, hole)
    const keep = new Uint32Array(idx.length)
    let n = 0
    for (let q = 0; q < idx.length; q += 6) {
      if (inside(pos, idx[q], r) && inside(pos, idx[q + 5], r)) continue // a 0.25 m overlap with the near tile, no gap
      keep.set(idx.subarray(q, q + 6), n)
      n += 6
    }
    geometry.setIndex(new THREE.BufferAttribute(keep.subarray(0, n), 1))
    return () => geometry.setIndex(full)
  }, [geometry, hole, t])
  const old = useStore((s) => s.year < 1950) // before 1950 the ground is the OS 1893-96 London Town Plan (NLS)
  const maps = useMemo(() => (t.maps ?? ['color.jpg', 'color-1890s.jpg'].map((f) => new THREE.TextureLoader().load(t.base + f))).map((tex) => {
    // both up front, so the year scrub swaps without a blank frame
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = gl.capabilities.getMaxAnisotropy()
    return tex
  }), [gl, t])
  const map = maps[old ? 1 : 0]
  useEffect(() => { ERA.value = old ? 1 : 0 }, [old])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh name={name} geometry={geometry} raycast={noRaycast} castShadow={!old} receiveShadow>{/* the shadow pass draws the raw DSM */}
      <meshStandardMaterial map={map} roughness={0.92} metalness={0} onBeforeCompile={facades} customProgramCacheKey={() => 'terrain-facades'} />
    </mesh>
  )
}

// Height ramp for the LiDAR look: deep blue at the river, through cyan and green, to warm white on the towers.
const RAMP = ['#0b1d4d', '#1565c0', '#00bcd4', '#43e97b', '#f9d423', '#ff6b35', '#fff4e6'].map((c) => new THREE.Color(c))

function LidarPoints({ t, step, hole, name = 'terrain-lidar' }) {
  const res = (t.meta.bbox_osgb[2] - t.meta.bbox_osgb[0]) / t.w
  const geometry = useMemo(() => {
    const all = grid(t, step).pos, r = hole && rect(t.meta, hole)
    const pos = r ? all.filter((_, i) => !inside(all, Math.floor(i / 3), r)) : all
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
  }, [t, step, hole])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <points name={name} geometry={geometry} raycast={noRaycast}>
      <pointsMaterial vertexColors size={step * res * 1.1} sizeAttenuation toneMapped={false} />
    </points>
  )
}

// The outer 1.5 km tile, plus on desktop the 0.5 m near field around the bridge once it has loaded.
function Tiles({ lidar, step }) {
  const t = useTerrain()
  const near = useNear()
  const hole = near?.meta.bbox_osgb
  const Look = lidar ? LidarPoints : TerrainMesh
  return (
    <>
      <Look t={t} step={step} hole={hole} />
      {near && <Look t={near} step={1} name={lidar ? 'terrain-lidar-near' : 'terrain-near'} />}
    </>
  )
}

/** Real EA LiDAR DSM of Tower Bridge with aerial imagery draped. `lidar` swaps to a height-coloured point cloud. */
export default function Terrain({ lidar = false, step = LITE ? 2 : 1 }) {
  const google = useGoogleShown(lidar)
  return (
    <Suspense fallback={null}>
      {(lidar || !google) && <Tiles lidar={lidar} step={step} />}{/* Ground stays: walk mode stands on it */}
      <Ground />
    </Suspense>
  )
}

export { Terrain }
