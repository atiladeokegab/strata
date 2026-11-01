import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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

export const merge = (gs) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)))

// Each material carries its kind so Part can recolour steel by year.
const mat = (kind, props) => Object.assign(new THREE.MeshStandardMaterial(props), { userData: { kind } })
export const MATERIALS = {
  stone: () => mat('stone', { color: '#d4ccb9', roughness: 0.9 }),
  granite: () => mat('stone', { color: '#a39d92', roughness: 0.95 }),
  slate: () => mat('slate', { color: '#3c434c', roughness: 0.7, metalness: 0.1 }),
  steel: () => mat('steel', { color: '#5b8fd0', roughness: 0.45, metalness: 0.5 }),
  white: () => mat('trim', { color: '#e9ecef', roughness: 0.5, metalness: 0.3 }),
  iron: () => mat('iron', { color: '#2c2f35', roughness: 0.6, metalness: 0.7 }),
  brass: () => mat('iron', { color: '#b08d4a', roughness: 0.35, metalness: 0.9 }),
  road: () => mat('road', { color: '#2b2b2e', roughness: 0.95 }),
  glass: () => mat('glass', { color: '#18202b', roughness: 0.15, metalness: 0.6 }),
  timber: () => mat('timber', { color: '#6b5236', roughness: 0.9 }),
  gold: () => mat('trim', { color: '#c9a646', roughness: 0.3, metalness: 1 }),
}
const cache = {}
export const M = new Proxy({}, { get: (_, k) => (cache[k] ??= MATERIALS[k]()) })

// Painted chocolate-brown in 1894; red, white and blue for the 1977 Silver Jubilee; blue and
// white since. status: inferred (wiki-tb), not yet in data.
export const steelColour = (year) => (year < 1977 ? '#5a4033' : '#5b8fd0')
