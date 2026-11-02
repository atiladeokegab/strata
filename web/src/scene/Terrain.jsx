import { Suspense, use, useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import { GOOGLE_FROM } from './google/state'
import { APPROACH, STREETS, levelStreets, sinkShelves } from './bareEarth.js'
import { eraFor } from './bridge/stages.js'
import { KERB_X } from './bridge/roadway.js'
import { LITE } from './look/tier'
import { GroundStandIn } from '../ui/StandIns'

// Google Photorealistic 3D Tiles own the ground when they are streaming and LiDAR is off; optional, like Buildings.jsx.
const google = Object.values(import.meta.glob('./google/state.js', { eager: true }))[0]
export const useGoogleShown = google?.useGoogleShown ?? (() => false)

const BASE = '/terrain/tower-bridge/'
const MAPS = ['color.jpg', 'color-1890s.jpg'] // today's aerial, the OS 1893-96 sheet
const texture = (url) => new THREE.TextureLoader().loadAsync(url)
let metaCache, lowCache, cache, fullCache, nearCache, mirrorCache, surfaceCache, nearSurfaceCache
const loadMeta = () => (metaCache ??= fetch(BASE + 'meta.json').then((r) => r.json()))

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

// Load order, so a phone on slow 4G sees textured ground first (scripts/terrain/near.py builds lo/ and near/):
// 1. lo/: the whole 1.5 km at 4 m with small drapes, ~0.4 MB, every device;
// 2. the full 1 m tile and its 4096 px drapes, fetched only after lo/ is in;
// 3. desktop only: the 600 m near field at 0.5 m. Each stage resolves with its drapes in, so it never shows grey.
// Each stage's mesh is built off the main thread (rtin below) and capped at BUDGET triangles: the lead's cap is
// ~500k on desktop (250k outer + 250k near) and ~150k on phones and for the first-load tile.
// The ground is bare.png in every era: the EA LiDAR DTM with the approach viaducts kept (scripts/terrain/build.py).
// `old` (the shader's aOld) is the same ground; height.png, the DSM with roofs and trees, is only the LiDAR point view.
const tile = (meta, { heights, w, h }) => ({ meta, heights, old: heights, w, h })
// The ground: bare.png with the approach streets brought up to the deck ends and the river's shelves sunk (bareEarth.js);
// never the DSM.
const ground = (meta, px) => tile(meta, { ...px, heights: sinkShelves({ meta, ...px, heights: levelStreets({ meta, ...px }) }) })

const BUDGET = { low: 150_000, full: LITE ? 150_000 : 250_000, near: 250_000, mirror: 30_000 }

export function loadLow() {
  lowCache ??= (async () => {
    const meta = await loadMeta()
    const base = meta.lite ? BASE + 'lo/' : BASE
    const [px, ...maps] = await Promise.all([decodeHeights(base + 'bare.png', meta), ...MAPS.map((f) => texture(base + f))])
    const t = ground(meta, px)
    loadSurfaces(meta)
    return { ...t, maps, mesh: await meshOf(t, BUDGET.low) }
  })()
  return lowCache
}

/** The full 1 m outer tile's ground heights (no drapes), once per page; queued behind the first-load tile. */
export function loadTerrain() {
  // phones: 2 m (~0.3 MB) is plenty under their 150k-triangle cap; the 1 m file is 1.7 MB
  cache ??= loadLow().then(async ({ meta }) => ground(meta, await decodeHeights(BASE + (LITE ? 'bare-2m.png' : 'bare.png'), meta)))
  return cache
}

// The DSM as flown, outer and near, for the LiDAR point view only (fetched when it is first switched on).
function loadSurface() {
  surfaceCache ??= loadLow().then(async ({ meta }) => tile(meta, await decodeHeights(BASE + 'height.png', meta)))
  return surfaceCache
}
function loadNearSurface() {
  nearSurfaceCache ??= loadLow().then(async ({ meta: m }) => {
    const meta = { ...m, bbox_osgb: m.near.bbox_osgb }
    return tile(meta, await decodeHeights(BASE + 'near/height.png', meta))
  })
  return nearSurfaceCache
}

function loadFull() {
  const mesh = async (t) => ({ ...t, mesh: await meshOf(t, BUDGET.full, LITE ? undefined : t.meta.near?.bbox_osgb) })
  fullCache ??= loadLow().then(() => Promise.all([loadTerrain().then(mesh), ...MAPS.map((f) => texture(BASE + f))]))
    .then(([t, ...maps]) => ({ ...t, maps }))
  return fullCache
}

// The water mirror's ground (Water.jsx): the first-load tile again, coarse and whole (no near-field hole), drawn only
// in the reflection, so the mirror pass stays near the lead's 250k-triangle cap (the bridge alone is ~213k).
function loadMirror() {
  mirrorCache ??= loadLow().then(async (t) => ({ ...t, mesh: await meshOf(t, BUDGET.mirror) }))
  return mirrorCache
}

function loadNear() {
  nearCache ??= (async () => {
    const t = await loadTerrain()
    const meta = { ...t.meta, bbox_osgb: t.meta.near.bbox_osgb }
    const maps = await Promise.all(MAPS.map((f) => texture(BASE + 'near/' + f)))
    // the ground resampled from the outer 1 m DTM onto the 0.5 m grid (the DTM stops at 1 m), so both meshes meet;
    // the near tier's gain is its 0.15 m drapes
    const [w, h] = t.meta.near.size_px, res = (meta.bbox_osgb[2] - meta.bbox_osgb[0]) / w
    const [minE, , , maxN] = meta.bbox_osgb, [oE, oN] = meta.origin_osgb, heights = new Float32Array(w * h)
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
      heights[i * w + j] = heightAt(t, minE + (j + 0.5) * res - oE, oN - (maxN - (i + 0.5) * res)) + meta.origin_h
    }
    const g = tile(meta, { heights, w, h })
    return { ...g, maps, mesh: await meshOf(g, BUDGET.near) }
  })()
  return nearCache
}

// A later stage once it has loaded, else null (a failed stage just leaves the one before it showing).
function useLoaded(load, when = true) {
  const [value, setValue] = useState(null)
  useEffect(() => {
    if (!when) return
    let live = true
    load().then((v) => live && setValue(v)).catch(() => {})
    return () => { live = false }
  }, [load, when])
  return value
}

/** meta.json (bbox, origin, water level), as soon as the first-load tile is in. */
export const useTerrainMeta = () => use(loadLow()).meta

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
  const t = useLoaded(loadTerrain) ?? use(loadLow()) // the ground, not tree crowns, in every look
  const raycast = useMemo(() => heightfieldRaycast(t), [t])
  return <mesh name="terrain-ground" raycast={raycast} frustumCulled={false}><bufferGeometry /></mesh>
}

// Aerial imagery only sees roofs, so draped walls smear into streaks. On steep faces, swap to a
// blurred sample of the imagery (a far mip) toned toward London stone, which reads as a clean facade.
// The 1890s OS sheet as an old map: its paper renders as dulled #ddc79e stock in full light, never cream (the albedo is
// warmer still to offset the blue sky fill, measured on a still) and its ink as dark brown, with a
// little of the sheet's own hue kept (blue water, tinted blocks). The tone runs on gamma-encoded colour
// because the map sample is linear here; ERA_GAIN sets how bright the paper sits under the scene light.
// ERA is 1 while the old map is draped. BARE is 1 before Google's tiles (GOOGLE_FROM): the ground is bare earth
// (aOld), flat-lit. aOld now equals the position (the mesh is the DTM in every era), so BARE moves nothing.
const ERA = { value: 0 }, BARE = { value: 0 }
// The old map has no approach road, so the ramps would dead-end in cream paper, and the 1950s-2011 photo smears the
// real, curving road and its roofs over the levelled street: before Google's tiles the approach streets (bareEarth.js
// STREETS, in the bridge frame) take a road colour between the deck's kerb lines, at a constant width, and pale York
// stone, flagged by the road, over the whole levelled street, fading into the map or photo down its slopes, and
// over 60 m where it meets the city. Before 1950 the carriageway is laid in setts (or wood blocks), and in every era a
// granite kerb 0.3 m wide lines it; both fade out with distance before they would alias. The old map's sheet also stops short of the tile's edge in a beige plain, so past
// FAR_FROM m from the bridge it fades into FAR, the tone of distant roofs under haze. Asphalt is the deck's (bridge/roadway.js SURFACES); the wood is
// the deck's #7a6450 base as its block texture renders it, so the road runs on from the deck without a line.
// The ground's surfaces (scripts/terrain/surfaces.py: R St Katharine's basins, G the Tower's moat, B every OSM
// footprint), on the tile's grid, sampled by world position so the outer and near tiers share it. Before the marina
// (DOCKS_UNTIL) the basins are still water in a stone quay, and their photo's yachts go; the moat, drained in 1843-45,
// is dry grass in every bare era; in the photo's eras a footprint whose building is hidden by its date shows paving,
// not the photo's roof (a shown building covers its own).
const SURF = { value: null }, SURF_T = { value: new THREE.Vector4() }, SURF_S = { value: 1 }, DOCKS = { value: 0 }
const DOCKS_UNTIL = 1980, DOCK = new THREE.Color('#2e3838'), GRASS = new THREE.Color('#6f7349'), PAVING = new THREE.Color('#857e74')
function loadSurfaces(meta) {
  const [minE, , maxE, maxN] = meta.bbox_osgb, [oE, oN] = meta.origin_osgb, a = (meta.bridge_axis_deg * Math.PI) / 180
  SURF_T.value.set(Math.cos(a), Math.sin(a), oE - minE, maxN - oN)
  SURF_S.value = maxE - minE
  texture(BASE + 'surfaces.png').then((t) => { SURF.value = t }, () => {}) // missing: the ground keeps the drape
}
const ROAD = { value: new THREE.Color() }, WOOD = new THREE.Color('#6a5645'), ASPHALT = new THREE.Color('#3f3f3f')
const PAVE_X = 12 // m from the axis: the pavement's outer edge
const STONE = new THREE.Color('#969386'), KERB = new THREE.Color('#b3ada3'), FAR = new THREE.Color('#5a524b'), FAR_FROM = 350, FAR_TO = 600
// Before Google's tiles the ground past HAZE_FROM m fades into the fog's colour by HAZE_TO, inside the tile's 750 m
// half-width, and the skirt beyond takes the same colour, so the city ends in haze rather than a plain. In the
// photo's eras (1950-2011) it fades into a darker HAZE_PHOTO of it: their fog is paler than the sky and the river, so the
// fog itself drew a bright void at the horizon
const END_FEATHER = 12
const HAZE_FROM = 450, HAZE_TO = 740, HAZE_PHOTO = 0.7
const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2)
const v3 = (c) => `vec3(${c.toArray().map((v) => v.toFixed(3)).join(', ')})`
const ROAD_TINT = `
      float tAlong = abs(vRoadW.z), tAcross = abs(vRoadW.x);
      // in the photo's eras the ground between the north approach and St Katharine's west dock is today's photo on the
      // LiDAR's slope down to the marina, which smears; there the stone runs on at full strength to the dock's quay
      float tNE = step(0.0, vRoadW.x) * step(vRoadW.z, 0.0) * uBare * (1.0 - uEra);
      float tRoad = (smoothstep(${f1(APPROACH.from - 1.25)}, ${f1(APPROACH.from + 1.25)}, tAlong) - smoothstep(${f1(APPROACH.to)}, ${f1(APPROACH.to + 60)}, tAlong))
        * (1.0 - smoothstep(mix(${f1(STREETS.half)}, ${f1(STREETS.edge)}, tNE), ${f1(STREETS.edge + 20)}, tAcross));
      // metres per pixel across and along: the kerb edge sharpens near the camera and softens far off, and the setts'
      // joints and the kerb fade out before they would alias
      float tFx = fwidth(vRoadW.x), tFz = fwidth(vRoadW.z), tSoft = clamp(2.0 * tFx, 0.05, 0.75);
      vec2 tP = vec2(vRoadW.x / 0.45, vRoadW.z / 0.22); tP.x += 0.5 * mod(floor(tP.y), 2.0);
      vec2 tE = (0.5 - abs(fract(tP) - 0.5)) * vec2(0.45, 0.22); // metres to the nearest joint
      float tJoint = max((1.0 - smoothstep(0.015, 0.015 + tFx, tE.x)) * (1.0 - smoothstep(0.04, 0.1, tFx)),
        (1.0 - smoothstep(0.015, 0.015 + tFz, tE.y)) * (1.0 - smoothstep(0.04, 0.1, tFz))) * uEra;
      float tKerb = (smoothstep(${f2(KERB_X)} - tFx, ${f2(KERB_X)} + tFx, tAcross) - smoothstep(${f2(KERB_X + 0.3)} - tFx, ${f2(KERB_X + 0.3)} + tFx, tAcross))
        * (1.0 - smoothstep(0.08, 0.25, tFx));
      // the pavement: York stone flags 0.9 by 0.6 m out to PAVE_X, and a slow mottle on all the stone so it is never a
      // flat plain
      vec2 fP = vec2(vRoadW.x / 0.9, vRoadW.z / 0.6); fP.y += 0.5 * mod(floor(fP.x), 2.0);
      vec2 fE = (0.5 - abs(fract(fP) - 0.5)) * vec2(0.9, 0.6);
      float fJoint = max((1.0 - smoothstep(0.02, 0.02 + tFx, fE.x)) * (1.0 - smoothstep(0.05, 0.15, tFx)),
        (1.0 - smoothstep(0.02, 0.02 + tFz, fE.y)) * (1.0 - smoothstep(0.05, 0.15, tFz))) * (1.0 - smoothstep(${f1(PAVE_X)}, ${f1(PAVE_X + 0.5)}, tAcross));
      vec2 mC = floor(vRoadW.xz / 7.0), mF = fract(vRoadW.xz / 7.0); mF = mF * mF * (3.0 - 2.0 * mF);
      #define tHash(q) fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453)
      float tMottle = mix(mix(tHash(mC), tHash(mC + vec2(1, 0)), mF.x), mix(tHash(mC + vec2(0, 1)), tHash(mC + vec2(1, 1)), mF.x), mF.y);
      // the first END_FEATHER m past each deck end feather into the deck's own flat surfaces, so there is no line where
      // they meet: the flags, setts and mottle fade out and the tone meets what the deck renders (measured on the 1900,
      // 1940 and 1971 end-out stills: the south footway lights about 1.3 times the street's stone, the north road 0.68
      // times the street's road)
      float tEnd = 1.0 - smoothstep(${f1(STREETS.deckEnd)}, ${f1(STREETS.deckEnd + END_FEATHER)}, tAlong), tSouth = step(0.0, vRoadW.z);
      float tM = mix(tMottle, 0.5, tEnd);
      vec3 tStone = ${v3(STONE)} * (0.88 + 0.2 * tM) * (1.0 - 0.3 * fJoint * (1.0 - tEnd)) * (1.0 + 0.3 * tSouth * tEnd);
      vec3 tCol = mix(uRoad * (1.0 - 0.35 * tJoint * (1.0 - tEnd)) * (1.0 - 0.32 * (1.0 - tSouth) * tEnd), tStone, smoothstep(${f2(KERB_X)} - tSoft, ${f2(KERB_X)} + tSoft, tAcross));
      tCol = mix(tCol, vec3(${KERB.toArray().map((c) => c.toFixed(3)).join(', ')}), tKerb);
      diffuseColor.rgb = mix(diffuseColor.rgb, tCol, tRoad * max(uEra, uBare));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${FAR.toArray().map((c) => c.toFixed(3)).join(', ')}), smoothstep(${f1(FAR_FROM)}, ${f1(FAR_TO)}, length(vRoadW.xz)) * uEra);`
const SURFACES = `
      // world (bridge frame) to the tile's grid (east, south from the origin), then to the mask's uv (v = 1 north)
      vec2 sG = vec2(vRoadW.x * uSurfT.x - vRoadW.z * uSurfT.y, vRoadW.x * uSurfT.y + vRoadW.z * uSurfT.x);
      vec3 sM = texture2D(uSurf, vec2((sG.x + uSurfT.z) / uSurfS, 1.0 - (sG.y + uSurfT.w) / uSurfS)).rgb;
      float sDock = smoothstep(0.55, 0.8, sM.r) * uDocks, sQuay = smoothstep(0.08, 0.3, sM.r) * (1.0 - smoothstep(0.55, 0.8, sM.r)) * uDocks;
      // on the streets' own ground the paving is their stone, so a hidden building's footprint leaves no darker patch
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(${v3(PAVING)} * (0.9 + 0.15 * tMottle), tStone, tRoad), smoothstep(0.5, 0.9, sM.b) * uBare * (1.0 - uEra));
      diffuseColor.rgb = mix(diffuseColor.rgb, ${v3(GRASS)} * (0.85 + 0.25 * tMottle), smoothstep(0.3, 0.7, sM.g) * uBare);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${v3(KERB)}, sQuay);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${v3(DOCK)}, sDock);`
// The DTM keeps the approach viaducts (build.py keep_approaches), so under the bridge's own ramps and abutments the
// ground lay in the plane of their stone and z-fought it: there it drops a real 0.5 m (the bridge frame: rotation only).
const UNDER_BRIDGE = `float tUnder = (1.0 - smoothstep(9.5, 10.5, abs(vRoadW.x))) * (1.0 - smoothstep(180.0, 186.0, abs(vRoadW.z)));
transformed.y -= 0.5 * tUnder;
vRoadW.y -= 0.5 * tUnder;`
const ERA_GAIN = '1.0'
const ERA_GRADE = `
  vec3 eraGrade(vec3 c) {
    vec3 s = pow(max(c, 0.0), vec3(1.0 / 2.2));
    float l = dot(s, vec3(0.3, 0.59, 0.11));
    vec3 tone = mix(vec3(0.30, 0.21, 0.13), vec3(0.87, 0.78, 0.62), smoothstep(0.30, 0.88, l));
    vec3 t = mix(tone, tone * s / max(l, 0.05), 0.35);
    return mix(c, pow(clamp(t, 0.0, 1.0), vec3(2.2)) * ${ERA_GAIN}, uEra);
  }`

function facades(shader) {
  shader.uniforms.uEra = ERA
  shader.uniforms.uBare = BARE
  shader.uniforms.uRoad = ROAD
  Object.assign(shader.uniforms, { uSurf: SURF, uSurfT: SURF_T, uSurfS: SURF_S, uDocks: DOCKS })
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vUp;\nvarying vec3 vRoadW;\nuniform float uBare;\nattribute float aOld;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif (uBare > 0.5 && position.y - aOld > 0.3) objectNormal = vec3(0.0, 1.0, 0.0);\nvUp = objectNormal.y;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed.y = mix(transformed.y, aOld, uBare);
vRoadW = (modelMatrix * vec4(transformed, 1.0)).xyz;
${UNDER_BRIDGE}`)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying float vUp;\nvarying vec3 vRoadW;\nuniform float uEra;\nuniform float uBare;\nuniform vec3 uRoad;\nuniform sampler2D uSurf;\nuniform vec4 uSurfT;\nuniform float uSurfS;\nuniform float uDocks;${ERA_GRADE}`)
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      diffuseColor.rgb = eraGrade(diffuseColor.rgb);
      float wall = 1.0 - smoothstep(0.35, 0.7, vUp);
      vec3 blur = eraGrade(texture2D(map, vMapUv, 5.0).rgb);
      vec3 facade = mix(blur, vec3(0.42, 0.39, 0.34), 0.3) * 0.8;
      diffuseColor.rgb = mix(diffuseColor.rgb, facade, wall);${ROAD_TINT}${SURFACES}`,
    )
    .replace('#include <fog_fragment>', `#include <fog_fragment>
      #ifdef USE_FOG
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * mix(${f2(HAZE_PHOTO)}, 1.0, uEra), smoothstep(${f1(HAZE_FROM)}, ${f1(HAZE_TO)}, length(vRoadW.xz)) * uBare);
      #endif`)
}

// Scene-space rect [x0, z0, x1, z1] of an OSGB bbox, for cutting the near tile's hole in the outer one.
function rect(meta, [minE, minN, maxE, maxN]) {
  const [oE, oN] = meta.origin_osgb
  return [minE - oE, oN - maxN, maxE - oE, oN - minN]
}
const inside = (p, k, r) => r && p[k * 3] >= r[0] && p[k * 3] <= r[2] && p[k * 3 + 2] >= r[1] && p[k * 3 + 2] <= r[3]

// Error-driven mesh (RTIN), adapted from @mapbox/martini (ISC): the tile is resampled onto a (2^k+1)² grid of
// right triangles, and a triangle splits only where its height error is over maxError. Errors propagate to
// parents, so neighbours always agree on shared edges: no cracks. maxError is searched to fit `budget` triangles.
// The mesh is the bare earth (bareEarth.js) in every year: it only shows when OSM buildings (Buildings.jsx) stand
// on it, and the DSM's own roofs and tree crowns drew as curtains and spikes beside them. The LiDAR look keeps the DSM.
function rtin({ meta, old, w, h }, budget, seam) {
  const size = Math.min(1025, 2 ** Math.ceil(Math.log2(Math.max(w, h) - 1)) + 1), max = size - 1
  const sx = (w - 1) / max, sy = (h - 1) / max // source pixels per grid step
  const sample = (src) => {
    const out = new Float32Array(size * size)
    for (let gy = 0, k = 0; gy < size; gy++) {
      const i = Math.min(gy * sy, h - 1.0001), i0 = Math.floor(i), fi = i - i0
      for (let gx = 0; gx < size; gx++, k++) {
        const j = Math.min(gx * sx, w - 1.0001), j0 = Math.floor(j), fj = j - j0, q = i0 * w + j0
        out[k] = (src[q] * (1 - fj) + src[q + 1] * fj) * (1 - fi) + (src[q + w] * (1 - fj) + src[q + w + 1] * fj) * fi
      }
    }
    return out
  }
  const O = sample(old)
  const errors = new Float32Array(size * size)
  // keep full detail along seams: the tile's own border, and on the outer tile the near tile's border
  const lock = (x0, y0, x1, y1) => {
    for (let gy = Math.max(0, Math.floor(y0) - 1); gy <= Math.min(max, Math.ceil(y1) + 1); gy++)
      for (let gx = Math.max(0, Math.floor(x0) - 1); gx <= Math.min(max, Math.ceil(x1) + 1); gx++)
        if (Math.abs(gx - x0) <= 1 || Math.abs(gx - x1) <= 1 || Math.abs(gy - y0) <= 1 || Math.abs(gy - y1) <= 1) errors[gy * size + gx] = Infinity
  }
  const [minE, , maxE, maxN] = meta.bbox_osgb
  const res = (maxE - minE) / w
  lock(0, 0, max, max)
  if (seam) lock(((seam[0] - minE) / res - 0.5) / sx, ((maxN - seam[3]) / res - 0.5) / sy, ((seam[2] - minE) / res - 0.5) / sx, ((maxN - seam[1]) / res - 0.5) / sy)
  // every triangle's hypotenuse a-b, finest last (martini's triangle ids)
  const n = max * max * 2 - 2, parents = n - max * max, coords = new Uint16Array(n * 4)
  for (let t = 0; t < n; t++) {
    let id = t + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0
    if (id & 1) bx = by = cx = max; else ax = ay = cy = max
    while ((id >>= 1) > 1) {
      const mx = (ax + bx) >> 1, my = (ay + by) >> 1
      if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy } else { ax = bx; ay = by; bx = cx; by = cy }
      cx = mx; cy = my
    }
    coords[t * 4] = ax; coords[t * 4 + 1] = ay; coords[t * 4 + 2] = bx; coords[t * 4 + 3] = by
  }
  for (let t = n - 1; t >= 0; t--) {
    const k = t * 4, ax = coords[k], ay = coords[k + 1], bx = coords[k + 2], by = coords[k + 3]
    const mx = (ax + bx) >> 1, my = (ay + by) >> 1, cx = mx + my - ay, cy = my + ax - mx, m = my * size + mx
    let e = Math.abs((O[ay * size + ax] + O[by * size + bx]) / 2 - O[m])
    if (t < parents) e = Math.max(e, errors[((ay + cy) >> 1) * size + ((ax + cx) >> 1)], errors[((by + cy) >> 1) * size + ((bx + cx) >> 1)])
    if (e > errors[m]) errors[m] = e
  }
  const walk = (maxError, leaf) => {
    const go = (ax, ay, bx, by, cx, cy) => {
      const mx = (ax + bx) >> 1, my = (ay + by) >> 1
      if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * size + mx] > maxError) {
        if (go(cx, cy, ax, ay, mx, my) === false) return false
        return go(bx, by, cx, cy, mx, my)
      }
      return leaf(ax, ay, bx, by, cx, cy)
    }
    go(0, 0, max, max, max, 0) !== false && go(max, max, 0, 0, 0, max)
  }
  let lo = 0.01, hi = 256 // metres, searched on a log scale; the tile spans 177
  for (let it = 0; it < 12; it++) {
    const mid = Math.sqrt(lo * hi)
    let count = 0
    walk(mid, () => ++count <= budget)
    if (count > budget) lo = mid; else hi = mid
  }
  const vid = new Int32Array(size * size).fill(-1), tris = []
  let nv = 0
  const at = (x, y) => { const g = y * size + x; if (vid[g] < 0) vid[g] = nv++; return vid[g] }
  walk(hi, (ax, ay, bx, by, cx, cy) => { tris.push(at(ax, ay), at(bx, by), at(cx, cy)) })
  const [oE, oN] = meta.origin_osgb
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), low = new Float32Array(nv)
  for (let g = 0; g < vid.length; g++) {
    const v = vid[g]
    if (v < 0) continue
    const j = (g % size) * sx, i = Math.floor(g / size) * sy
    pos[v * 3] = minE + (j + 0.5) * res - oE
    pos[v * 3 + 1] = O[g] - meta.origin_h
    pos[v * 3 + 2] = oN - (maxN - (i + 0.5) * res)
    uv[v * 2] = (j + 0.5) / w
    uv[v * 2 + 1] = 1 - (i + 0.5) / h
    low[v] = O[g] - meta.origin_h
  }
  return { pos, uv, low, index: new Uint32Array(tris), maxError: hi }
}

// Runs rtin in a worker (its source is self-contained), so a 1025² tile never stalls a frame; inline if workers fail.
function meshOf(t, budget, seam) {
  const args = [{ meta: t.meta, old: t.old, w: t.w, h: t.h }, budget, seam]
  return new Promise((resolve, reject) => {
    const src = `onmessage = (e) => { const r = (${rtin})(...e.data); postMessage(r, [r.pos.buffer, r.uv.buffer, r.low.buffer, r.index.buffer]) }`
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
    const worker = new Worker(url)
    const done = () => { worker.terminate(); URL.revokeObjectURL(url) }
    worker.onmessage = (e) => { done(); resolve(e.data) }
    worker.onerror = (e) => { done(); reject(e) }
    worker.postMessage(args)
  }).catch(() => rtin(...args))
}

// A tile's mesh as CHUNKS² pieces (normals from the whole mesh, so cuts don't shade); triangles inside `hole` go.
// One piece: the draw-call caps (155 lite, 300 desktop, and the water mirror redraws the terrain) outweigh what
// culling would save at 150-500k triangles.
const CHUNKS = 1
function chunked({ meta, mesh }, hole) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(mesh.pos, 3))
  g.setIndex(new THREE.BufferAttribute(mesh.index, 1))
  g.computeVertexNormals()
  const pos = mesh.pos, nor = g.attributes.normal.array, idx = mesh.index
  const [x0, z0, x1, z1] = rect(meta, meta.bbox_osgb), r = hole && rect(meta, hole)
  const lists = Array.from({ length: CHUNKS * CHUNKS }, () => [])
  for (let q = 0; q < idx.length; q += 3) {
    const a = idx[q], b = idx[q + 1], c = idx[q + 2]
    if (r && inside(pos, a, r) && inside(pos, b, r) && inside(pos, c, r)) continue // the seam is full detail, so the overlap is one grid step
    const i = Math.min(CHUNKS - 1, Math.floor((((pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3 - x0) / (x1 - x0)) * CHUNKS))
    const j = Math.min(CHUNKS - 1, Math.floor((((pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3 - z0) / (z1 - z0)) * CHUNKS))
    lists[j * CHUNKS + i].push(a, b, c)
  }
  const remap = new Int32Array(mesh.low.length).fill(-1)
  return lists.filter((l) => l.length).map((l) => {
    const verts = []
    const index = Uint32Array.from(l, (v) => (remap[v] < 0 ? (remap[v] = verts.push(v) - 1) : remap[v]))
    const n = verts.length, P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), L = new Float32Array(n)
    verts.forEach((v, k) => {
      remap[v] = -1 // ready for the next chunk
      for (let d = 0; d < 3; d++) { P[k * 3 + d] = pos[v * 3 + d]; N[k * 3 + d] = nor[v * 3 + d] }
      U[k * 2] = mesh.uv[v * 2]; U[k * 2 + 1] = mesh.uv[v * 2 + 1]
      L[k] = mesh.low[v]
    })
    const c = new THREE.BufferGeometry()
    c.setAttribute('position', new THREE.BufferAttribute(P, 3))
    c.setAttribute('normal', new THREE.BufferAttribute(N, 3))
    c.setAttribute('uv', new THREE.BufferAttribute(U, 2))
    c.setAttribute('aOld', new THREE.BufferAttribute(L, 1))
    c.setIndex(new THREE.BufferAttribute(index, 1))
    c.computeBoundingSphere()
    return c
  })
}

function TerrainMesh({ t, hole, name = 'terrain', visible = true }) {
  const gl = useThree((s) => s.gl)
  const chunks = useMemo(() => chunked(t, hole), [t, hole])
  const old = useStore((s) => s.year < 1950) // before 1950 the ground is the OS 1893-96 London Town Plan (NLS)
  const maps = useMemo(() => t.maps.map((tex) => {
    // both up front, so the year scrub swaps without a blank frame
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = gl.capabilities.getMaxAnisotropy()
    return tex
  }), [gl, t])
  // one material for every chunk; where the outer tile overlaps the near one, the near one wins the depth test
  const material = useMemo(() => Object.assign(new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    { onBeforeCompile: facades, customProgramCacheKey: () => 'terrain-facades' }), [])
  material.map = maps[old ? 1 : 0]
  material.polygonOffset = !!hole
  const bare = useStore((s) => s.year < GOOGLE_FROM)
  const wood = useStore((s) => eraFor(s.year).woodBlocks)
  useEffect(() => { ERA.value = old ? 1 : 0 }, [old])
  useEffect(() => { ROAD.value.copy(wood ? WOOD : ASPHALT) }, [wood])
  useEffect(() => { BARE.value = bare ? 1 : 0 }, [bare])
  const docks = useStore((s) => s.year < DOCKS_UNTIL)
  useEffect(() => { DOCKS.value = docks ? 1 : 0 }, [docks])
  useEffect(() => () => chunks.forEach((c) => c.dispose()), [chunks])
  useEffect(() => () => material.dispose(), [material])
  // no castShadow: bare earth casts next to nothing, and the shadow pass would redraw all of it
  return (
    <group name={name} visible={visible}>
      {chunks.map((c, k) => <mesh key={k} geometry={c} material={material} raycast={noRaycast} receiveShadow />)}
    </group>
  )
}

// Beyond the tile: flat ground at the tile edge's median height, in the edge's mean colour (before Google's tiles: the
// haze the tile's edge fades into, HAZE_FROM above, so the city never stops at a plain), thinning into the sky
// with distance (the fog colour is lighter than the sky at the horizon, so fogging it drew a bright rim).
// Without it, low views with tiles off end in a cliff against the sky ~750 m out.
const SKIRT = 20000 // m
function fadeOut(shader) {
  Object.assign(shader.uniforms, { uEra: ERA, uBare: BARE })
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vSkirt;')
    .replace('#include <fog_vertex>', '#include <fog_vertex>\nvSkirt = -mvPosition.z;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vSkirt;\nuniform float uEra;\nuniform float uBare;')
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>
#ifdef USE_FOG
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * mix(${f2(HAZE_PHOTO)}, 1.0, uEra), uBare);
#endif
gl_FragColor.a *= 1.0 - smoothstep(1500.0, 9000.0, vSkirt);`)
}
function edgeColour(tex) {
  try {
    const c = document.createElement('canvas'), n = 8
    c.width = c.height = n
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(tex.image, 0, 0, n, n)
    const d = g.getImageData(0, 0, n, n).data, sum = [0, 0, 0]
    let m = 0
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = (i / n) | 0
      if (x > 0 && y > 0 && x < n - 1 && y < n - 1) continue
      for (let k = 0; k < 3; k++) sum[k] += d[i * 4 + k]
      m++
    }
    return new THREE.Color().setRGB(sum[0] / m / 255, sum[1] / m / 255, sum[2] / m / 255, THREE.SRGBColorSpace)
  } catch { return new THREE.Color(0x6f7568) } // a London grey-green when the image cannot be read back
}
function Skirt({ t }) {
  const old = useStore((s) => s.year < 1950)
  const geometry = useMemo(() => {
    const { meta, old: O, w, h } = t, edge = []
    for (let j = 0; j < w; j++) edge.push(O[j], O[(h - 1) * w + j])
    for (let i = 0; i < h; i++) edge.push(O[i * w], O[i * w + w - 1])
    edge.sort((a, b) => a - b)
    const y = edge[edge.length >> 1] - meta.origin_h, [x0, z0, x1, z1] = rect(meta, meta.bbox_osgb), R = SKIRT
    const pos = [x0, z0, x1, z0, x1, z1, x0, z1, -R, -R, R, -R, R, R, -R, R].flatMap((v, k, a) => (k % 2 ? [] : [v, y, a[k + 1]]))
    const index = []
    for (let i = 0; i < 4; i++) { const P = 4 + i, Q = 4 + ((i + 1) % 4), p = i, q = (i + 1) % 4; index.push(P, q, Q, P, p, q) } // faces up
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Array(24).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3))
    g.setIndex(index)
    return g
  }, [t])
  const colour = useMemo(() => edgeColour(t.maps[0]), [t])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh name="terrain-skirt" geometry={geometry} raycast={noRaycast} frustumCulled={false}>
      <meshStandardMaterial color={old ? FAR : colour} roughness={1} metalness={0} transparent depthWrite={false} onBeforeCompile={fadeOut} customProgramCacheKey={() => 'terrain-skirt'} />
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

// The outer 1.5 km tile (first-load, then full), plus on desktop the 0.5 m near field once it has loaded.
function Tiles({ lidar, step }) {
  const low = use(loadLow())
  const full = useLoaded(loadFull)
  const near = useLoaded(loadNear, !LITE && !!full)
  const mirror = useLoaded(loadMirror, !LITE)
  const surface = useLoaded(loadSurface, lidar)
  const nearSurface = useLoaded(loadNearSurface, lidar && !LITE && !!surface)
  if (lidar) return (
    <>
      <LidarPoints t={surface ?? low} step={surface ? step : 1} hole={nearSurface?.meta.bbox_osgb} />
      {nearSurface && <LidarPoints t={nearSurface} step={1} name="terrain-lidar-near" />}
    </>
  )
  return (
    <>
      <TerrainMesh t={full ?? low} hole={near?.meta.bbox_osgb} />
      <Skirt t={full ?? low} />
      {near && <TerrainMesh t={near} name="terrain-near" />}
      {mirror && <TerrainMesh t={mirror} name="terrain-mirror" visible={false} />}
    </>
  )
}

/** Bare earth from the EA LiDAR DTM with aerial imagery draped. `lidar` swaps to the DSM as a height-coloured point cloud. */
export default function Terrain({ lidar = false, step = LITE ? 2 : 1 }) {
  const google = useGoogleShown(lidar)
  return (
    <Suspense fallback={<GroundStandIn />}>
      {(lidar || !google) && <Tiles lidar={lidar} step={step} />}{/* Ground stays: walk mode stands on it */}
      <Ground />
    </Suspense>
  )
}

export { Terrain }
