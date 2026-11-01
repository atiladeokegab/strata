// Adapted from Mechanica (MIT, github.com/Caleb0796/mechanica), src/core/textures.ts: seeded procedural
// PBR texture sets (colour, normal, roughness) built on a canvas, cached per variant. Strata swaps the
// machine palettes for Tower Bridge's materials and adds masonry coursing; the idle-slice warmup follows
// Mechanica's geometryWarmup (small time slices so the first frames never stall).
//
// Use:  <meshStandardMaterial {...pbr('stone:portland', 4)} />   (4 = texture repeats across the UVs)
import * as THREE from 'three'

const MAP_SIZE = 512
const SURFACE_SIZE = 256

// low/high: sRGB colour range; roughness: [smooth, rough]; course: masonry block size in px (0 = none)
const PALETTES = {
  'stone:portland': { low: [176, 166, 146], high: [222, 214, 196], metalness: 0, normalScale: 0.55, roughness: [0.62, 0.92], course: [64, 28], seed: 1201 },
  'granite:cornish': { low: [118, 116, 112], high: [176, 172, 166], metalness: 0, normalScale: 0.45, roughness: [0.5, 0.85], course: [80, 40], seed: 1693, speckle: true },
  'steel:blue': { low: [72, 108, 140], high: [112, 150, 182], metalness: 0.45, normalScale: 0.18, roughness: [0.32, 0.55], course: 0, seed: 2311 },
  'steel:white': { low: [196, 200, 202], high: [232, 234, 234], metalness: 0.3, normalScale: 0.15, roughness: [0.35, 0.55], course: 0, seed: 2477 },
  'iron:cast': { low: [42, 46, 49], high: [78, 84, 88], metalness: 0.8, normalScale: 0.28, roughness: [0.48, 0.68], course: 0, seed: 5003 },
  'slate:roof': { low: [52, 58, 64], high: [86, 94, 102], metalness: 0.05, normalScale: 0.6, roughness: [0.45, 0.75], course: [24, 14], seed: 3371 },
  'wood:dark': { low: [42, 25, 17], high: [90, 57, 37], metalness: 0.08, normalScale: 0.42, roughness: [0.58, 0.86], course: 0, seed: 1103, grain: true },
  'asphalt': { low: [48, 48, 50], high: [78, 77, 76], metalness: 0, normalScale: 0.35, roughness: [0.78, 0.96], course: 0, seed: 4129, speckle: true },
}
export const MATERIAL_TEXTURE_VARIANTS = Object.keys(PALETTES)

const cache = new Map()

function hashNoise(x, y, seed) {
  let v = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed
  v = Math.imul(v ^ (v >>> 13), 1274126177)
  return ((v ^ (v >>> 16)) >>> 0) / 0xffffffff
}

function smoothNoise(x, y, seed, cell) {
  const gx = Math.floor(x / cell)
  const gy = Math.floor(y / cell)
  const lx = (x - gx * cell) / cell
  const ly = (y - gy * cell) / cell
  const ex = lx * lx * (3 - 2 * lx)
  const ey = ly * ly * (3 - 2 * ly)
  const top = THREE.MathUtils.lerp(hashNoise(gx, gy, seed), hashNoise(gx + 1, gy, seed), ex)
  const bottom = THREE.MathUtils.lerp(hashNoise(gx, gy + 1, seed), hashNoise(gx + 1, gy + 1, seed), ex)
  return THREE.MathUtils.lerp(top, bottom, ey)
}

// Height 0..1 and a per-pixel tone shift. Masonry: running-bond blocks with recessed mortar joints,
// each block its own tone so the wall does not read as one flat sheet.
function surface(p, x, y) {
  const broad = smoothNoise(x, y, p.seed, 32)
  const fine = smoothNoise(x, y, p.seed + 97, 6)
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
    const col = Math.floor(bx / bw)
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

  const color = new Uint8ClampedArray(MAP_SIZE * MAP_SIZE * 4)
  for (let y = 0; y < MAP_SIZE; y++)
    for (let x = 0; x < MAP_SIZE; x++) {
      const a = tone[(y >> 1) * N + (x >> 1)]
      const i = (y * MAP_SIZE + x) * 4
      for (let c = 0; c < 3; c++) color[i + c] = Math.round(THREE.MathUtils.lerp(p.low[c], p.high[c], a))
      color[i + 3] = 255
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
export function pbr(variant, repeat = 1) {
  const key = `${variant}@${repeat}`
  if (!repeated.has(key)) {
    const s = getMaterialTextureSet(variant)
    const [map, normalMap, roughnessMap] = [s.map, s.normalMap, s.roughnessMap].map((t) => {
      const c = t.clone()
      c.repeat.set(repeat, repeat)
      return c
    })
    repeated.set(key, {
      map, normalMap, roughnessMap,
      normalScale: new THREE.Vector2(s.normalScale, s.normalScale),
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
  for (const s of [...cache.values(), ...repeated.values()]) [s.map, s.normalMap, s.roughnessMap].forEach((t) => t.dispose())
  cache.clear()
  repeated.clear()
}
