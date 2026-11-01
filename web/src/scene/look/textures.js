// Adapted from Mechanica (MIT, github.com/Caleb0796/mechanica), src/core/textures.ts: seeded procedural
// PBR texture sets (colour, normal, roughness) built on a canvas, cached per variant. Strata swaps the
// machine palettes for Tower Bridge's materials and adds masonry coursing; the idle-slice warmup follows
// Mechanica's geometryWarmup (small time slices so the first frames never stall).
//
// Strata adds photographed sets (Poly Haven, CC0): 2K, 1K on the lite tier, swapped in over the procedural
// placeholder once decoded, so nothing waits or flashes black.
//
// Use:  <meshStandardMaterial {...pbr('stone:portland', 4)} />   (4 = texture repeats per UV unit)
//       <meshStandardMaterial {...pbr('stone:portland')} />      (metre UVs: the photo's real-world size)
import * as THREE from 'three'
import { LITE } from './tier'

const MAP_SIZE = 512
const SURFACE_SIZE = 256

// low/high: sRGB colour range; roughness: [smooth, rough]; course: masonry block size in px (0 = none)
const PALETTES = {
  'stone:portland': { low: [176, 166, 146], high: [222, 214, 196], metalness: 0, normalScale: 0.55, roughness: [0.62, 0.92], course: [64, 32], seed: 1201 },
  'granite:cornish': { low: [118, 116, 112], high: [176, 172, 166], metalness: 0, normalScale: 0.45, roughness: [0.5, 0.85], course: [64, 32], seed: 1693, speckle: true },
  'steel:blue': { low: [72, 108, 140], high: [112, 150, 182], metalness: 0.02, normalScale: 0.18, roughness: [0.32, 0.55], course: 0, seed: 2311 },
  'steel:white': { low: [196, 200, 202], high: [232, 234, 234], metalness: 0.02, normalScale: 0.15, roughness: [0.35, 0.55], course: 0, seed: 2477 },
  'iron:cast': { low: [42, 46, 49], high: [78, 84, 88], metalness: 0.8, normalScale: 0.28, roughness: [0.48, 0.68], course: 0, seed: 5003 },
  'slate:roof': { low: [52, 58, 64], high: [86, 94, 102], metalness: 0.05, normalScale: 0.6, roughness: [0.45, 0.75], course: [32, 16], seed: 3371 },
  'wood:dark': { low: [42, 25, 17], high: [90, 57, 37], metalness: 0.08, normalScale: 0.42, roughness: [0.58, 0.86], course: 0, seed: 1103, grain: true },
  'brick:london': { low: [150, 118, 74], high: [196, 164, 112], metalness: 0, normalScale: 0.5, roughness: [0.7, 0.95], course: [32, 16], seed: 2903, speckle: true },
  'asphalt': { low: [48, 48, 50], high: [78, 77, 76], metalness: 0, normalScale: 0.35, roughness: [0.78, 0.96], course: 0, seed: 4129, speckle: true },
}
export const MATERIAL_TEXTURE_VARIANTS = Object.keys(PALETTES)

// Photographed sets in public/textures/<id>/ (how they were made: public/textures/LICENSE.txt).
// m: the photo's real-world tile size in metres (Poly Haven's dimensions); grey: albedo is a neutral grey
// so material.color sets the paint (Part recolours the steel by year).
const PHOTO = {
  'stone:portland': { id: 'white_sandstone_blocks_02', m: 2 },
  'granite:cornish': { id: 'medieval_blocks_03', m: 2 },
  'steel:blue': { id: 'green_metal_rust', m: 1, grey: true },
  'steel:white': { id: 'green_metal_rust', m: 1, grey: true },
  'slate:roof': { id: 'roof_slates_03', m: 3 },
  'wood:dark': { id: 'weathered_planks', m: 2 },
  'brick:london': { id: 'yellow_brick', m: 2 },
  'asphalt': { id: 'asphalt_02', m: 3 },
}
/** Real-world size of one texture tile, in metres (for metre-UV geometry). */
export const tileMetres = (variant) => PHOTO[variant]?.m ?? 4
const RES = LITE ? '1k' : '2k'
const photos = new Map() // url -> { source, waiting: [textures] }

// Every clone of one photo shares one THREE.Source, so the GPU holds each image once whatever the repeats.
function photo(tex, url) {
  let p = photos.get(url)
  if (!p) {
    photos.set(url, (p = { source: null, waiting: [] }))
    new THREE.ImageBitmapLoader()
      .setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      .load(url, (bitmap) => {
        p.source = new THREE.Source(bitmap)
        p.waiting.splice(0).forEach((t) => swap(t, p.source))
      }, undefined, () => { p.waiting.length = 0 }) // keep the procedural placeholder if the photo fails
  }
  if (p.source) swap(tex, p.source)
  else p.waiting.push(tex)
}
function swap(t, source) {
  t.source = source
  t.flipY = false // the bitmap is already flipped
  t.anisotropy = LITE ? 4 : 16
  t.needsUpdate = true
}

const cache = new Map()

function hashNoise(x, y, seed) {
  let v = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed
  v = Math.imul(v ^ (v >>> 13), 1274126177)
  return ((v ^ (v >>> 16)) >>> 0) / 0xffffffff
}

// Value noise that wraps every SURFACE_SIZE px, so the textures tile without seams (cell must divide it).
function smoothNoise(x, y, seed, cell) {
  const P = SURFACE_SIZE / cell
  const gx = Math.floor(x / cell)
  const gy = Math.floor(y / cell)
  const lx = (x - gx * cell) / cell
  const ly = (y - gy * cell) / cell
  const ex = lx * lx * (3 - 2 * lx)
  const ey = ly * ly * (3 - 2 * ly)
  const h = (i, j) => hashNoise(((i % P) + P) % P, ((j % P) + P) % P, seed)
  const top = THREE.MathUtils.lerp(h(gx, gy), h(gx + 1, gy), ex)
  const bottom = THREE.MathUtils.lerp(h(gx, gy + 1), h(gx + 1, gy + 1), ex)
  return THREE.MathUtils.lerp(top, bottom, ey)
}

// Height 0..1 and a per-pixel tone shift. Masonry: running-bond blocks with recessed mortar joints,
// each block its own tone so the wall does not read as one flat sheet.
function surface(p, x, y) {
  const broad = smoothNoise(x, y, p.seed, 32)
  const fine = smoothNoise(x, y, p.seed + 97, 8)
  let h = broad * 0.5 + fine * 0.5
  let tone = broad * 0.7 + fine * 0.3
  if (p.grain) {
    const rings = 0.5 + 0.5 * Math.sin(x * 0.085 + broad * 3.2 + y * 0.012)
    h = rings * 0.34 + fine * 0.24 + broad * 0.42
    tone = h
  }
  if (p.speckle) tone = THREE.MathUtils.clamp(tone * 0.6 + hashNoise(x, y, p.seed + 7) * 0.4, 0, 1)
  if (p.course) {
    const [bw, bh] = p.course
    const row = Math.floor(y / bh)
    const bx = x + (row % 2) * (bw / 2)
    const col = Math.floor(bx / bw) % (SURFACE_SIZE / bw)
    const jx = Math.min(bx % bw, bw - (bx % bw))
    const jy = Math.min(y % bh, bh - (y % bh))
    const joint = THREE.MathUtils.smoothstep(Math.min(jx, jy), 0.5, 2.5)
    const block = hashNoise(col, row, p.seed + 31)
    h = joint * (0.55 + h * 0.45)
    tone = THREE.MathUtils.clamp(tone * 0.55 + block * 0.45, 0, 1) * (0.55 + 0.45 * joint)
  }
  return [THREE.MathUtils.clamp(h, 0, 1), THREE.MathUtils.clamp(tone, 0, 1)]
}

function canvasTexture(size, pixels, color) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  img.data.set(pixels)
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  return t
}

function generate(variant) {
  const p = PALETTES[variant]
  const N = SURFACE_SIZE
  const height = new Float32Array(N * N)
  const tone = new Float32Array(N * N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) [height[y * N + x], tone[y * N + x]] = surface(p, x, y)

  // colour map, plus a grey "detail" map (tone only) that multiplies a material's own colour
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  const floor = Math.max(lum(p.low) / lum(p.high), 0.62)
  const color = new Uint8ClampedArray(MAP_SIZE * MAP_SIZE * 4)
  const detail = new Uint8ClampedArray(MAP_SIZE * MAP_SIZE * 4)
  for (let y = 0; y < MAP_SIZE; y++)
    for (let x = 0; x < MAP_SIZE; x++) {
      const a = tone[(y >> 1) * N + (x >> 1)]
      const i = (y * MAP_SIZE + x) * 4
      for (let c = 0; c < 3; c++) color[i + c] = Math.round(THREE.MathUtils.lerp(p.low[c], p.high[c], a))
      detail[i] = detail[i + 1] = detail[i + 2] = Math.round(255 * THREE.MathUtils.lerp(floor, 1, a))
      color[i + 3] = detail[i + 3] = 255
    }

  const normal = new Uint8ClampedArray(N * N * 4)
  const rough = new Uint8ClampedArray(N * N * 4)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // wrap the neighbours so the tiles repeat seamlessly
      const dx = height[y * N + ((x + 1) % N)] - height[y * N + ((x + N - 1) % N)]
      const dy = height[((y + 1) % N) * N + x] - height[((y + N - 1) % N) * N + x]
      const nx = -dx * 2.4
      const ny = -dy * 2.4
      const len = Math.sqrt(nx * nx + ny * ny + 1)
      const i = (y * N + x) * 4
      normal[i] = Math.round((nx / len / 2 + 0.5) * 255)
      normal[i + 1] = Math.round((ny / len / 2 + 0.5) * 255)
      normal[i + 2] = Math.round((1 / len / 2 + 0.5) * 255)
      normal[i + 3] = 255
      const r = Math.round(THREE.MathUtils.lerp(p.roughness[1], p.roughness[0], height[y * N + x]) * 255)
      rough[i] = rough[i + 1] = rough[i + 2] = r
      rough[i + 3] = 255
    }

  return {
    variant,
    map: canvasTexture(MAP_SIZE, color, true),
    detail: canvasTexture(MAP_SIZE, detail, true),
    normalMap: canvasTexture(N, normal, false),
    roughnessMap: canvasTexture(N, rough, false),
    metalness: p.metalness,
    normalScale: p.normalScale,
  }
}

export function getMaterialTextureSet(variant) {
  if (!PALETTES[variant]) throw new Error(`Unknown material texture variant: ${variant}`)
  if (!cache.has(variant)) cache.set(variant, generate(variant))
  return cache.get(variant)
}

// Material props for <meshStandardMaterial {...pbr(variant, repeat)} />. Each repeat gets texture clones,
// which share the one uploaded image (three's Source), so this costs no extra GPU memory.
const repeated = new Map()
// detail = true gives a grey map, so the material keeps its own colour (and any recolour by year).
export function pbr(variant, repeat = 1 / tileMetres(variant), detail = false) {
  const key = `${variant}@${repeat}${detail ? 'd' : ''}`
  if (!repeated.has(key)) {
    const s = getMaterialTextureSet(variant)
    const ph = PHOTO[variant]
    const files = [(detail || ph?.grey) ? 'grey' : 'diff', 'nor', 'rough']
    const [map, normalMap, roughnessMap] = [detail ? s.detail : s.map, s.normalMap, s.roughnessMap].map((t, i) => {
      const c = t.clone()
      c.repeat.set(repeat, repeat)
      if (ph) photo(c, `/textures/${ph.id}/${RES}_${files[i]}.jpg`)
      return c
    })
    const ns = ph ? 1 : s.normalScale
    repeated.set(key, {
      map, normalMap, roughnessMap,
      normalScale: new THREE.Vector2(ns, ns),
      roughness: 1,
      metalness: s.metalness,
    })
  }
  return repeated.get(key)
}

// Build every texture set in idle time, one variant per slice, so the first click on a part never stalls.
export function warmMaterialTextures() {
  const todo = MATERIAL_TEXTURE_VARIANTS.filter((v) => !cache.has(v))
  const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 16))
  const step = () => {
    const v = todo.shift()
    if (!v) return
    getMaterialTextureSet(v)
    idle(step)
  }
  idle(step)
}

export function disposeMaterialTextureCache() {
  for (const s of [...cache.values(), ...repeated.values()]) [s.map, s.detail, s.normalMap, s.roughnessMap].forEach((t) => t?.dispose())
  cache.clear()
  repeated.clear()
}
