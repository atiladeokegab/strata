import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { pbr } from '../look/textures.js'

const UP = new THREE.Vector3(0, 1, 0)

// Cylinder from point a to point b.
export function beam(a, b, r = 0.15, sides = 6) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), sides, 1)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize()))
  const m = A.add(B).multiplyScalar(0.5)
  return g.translate(m.x, m.y, m.z)
}

export const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)

// Adapted from Mechanica (MIT), https://github.com/Caleb0796/mechanica (core/geometryUvs.ts).
// Box-projected UVs (Mechanica's ensureBoxProjectedUvs), changed to always overwrite and to use
// absolute coordinates at 1 UV unit per metre, so textures keep one scale across merged parts.
export function boxProjectUvs(source) {
  const g = source.index ? source.toNonIndexed() : source
  const pos = g.getAttribute('position')
  if (!pos || pos.count === 0) return g
  const uvs = new Float32Array(pos.count * 2)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let start = 0; start + 2 < pos.count; start += 3) {
    a.fromBufferAttribute(pos, start)
    b.fromBufferAttribute(pos, start + 1)
    c.fromBufferAttribute(pos, start + 2)
    n.crossVectors(b.sub(a), c.sub(a))
    const ax = Math.abs(n.x)
    const ay = Math.abs(n.y)
    const az = Math.abs(n.z)
    const axis = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z'
    const negative = n[axis] < 0
    for (let v = start; v < start + 3; v += 1) {
      const x = pos.getX(v)
      const y = pos.getY(v)
      const z = pos.getZ(v)
      const [u, w] = axis === 'x' ? [z, y] : axis === 'y' ? [x, z] : [x, y]
      uvs[v * 2] = negative ? -u : u
      uvs[v * 2 + 1] = w
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  return g
}

// Merged geometry gets world-scale (metre) box-projected UVs so the textures keep one scale.
export const merge = (gs) => mergeGeometries(gs.map(boxProjectUvs))

// Each material carries its kind so Part can recolour steel by year. Textures are the shared
// look/textures.js sets; `repeat` is tiles per metre, since merge gives metre UVs.
const mat = (kind, props, variant, metresPerTile) =>
  Object.assign(new THREE.MeshStandardMaterial({ ...(variant ? pbr(variant, 1 / metresPerTile) : {}), ...props }), {
    userData: { kind },
  })
export const MATERIALS = {
  stone: () => mat('stone', {}, 'stone:portland', 6),
  granite: () => mat('stone', {}, 'granite:cornish', 6),
  slate: () => mat('slate', {}, 'slate:roof', 4),
  // steel:white so Part's per-year steel colour tints it
  steel: () => mat('steel', { color: '#5b8fd0' }, 'steel:white', 6),
  white: () => mat('trim', { color: '#e9ecef', roughness: 0.5, metalness: 0.3 }),
  iron: () => mat('iron', {}, 'iron:cast', 3),
  brass: () => mat('iron', { color: '#b08d4a', roughness: 0.35, metalness: 0.9 }),
  road: () => mat('road', {}, 'asphalt', 4),
  glass: () => mat('glass', { color: '#18202b', roughness: 0.15, metalness: 0.6 }),
  timber: () => mat('timber', {}, 'wood:dark', 2),
  gold: () => mat('trim', { color: '#c9a646', roughness: 0.3, metalness: 1 }),
}
const cache = {}
export const M = new Proxy({}, { get: (_, k) => (cache[k] ??= MATERIALS[k]()) })

// Painted chocolate-brown in 1894; red, white and blue for the 1977 Silver Jubilee; blue and
// white since. status: inferred (wiki-tb), not yet in data.
export const steelColour = (year) => (year < 1977 ? '#5a4033' : '#5b8fd0')
