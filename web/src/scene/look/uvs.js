import * as THREE from 'three'

// Box-projected UVs in metres, so one texture scale holds on every part whatever its size. The axis is
// chosen per triangle from its face normal: per-vertex (smooth) normals flip axis mid-face on round parts
// and smear the texture. That needs unshared vertices, so indexed geometry is swapped for a non-indexed
// copy, one per source geometry.
const flat = new WeakMap()
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _scale = new THREE.Vector3()
export function worldUVs(mesh) {
  if (mesh.geometry.index) {
    if (!flat.has(mesh.geometry)) flat.set(mesh.geometry, mesh.geometry.toNonIndexed())
    mesh.geometry = flat.get(mesh.geometry)
  }
  const g = mesh.geometry
  if (g.userData.lookUV || !g.attributes.position) return
  g.userData.lookUV = true
  mesh.getWorldScale(_scale)
  const p = g.attributes.position
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i + 2 < p.count; i += 3) {
    _a.fromBufferAttribute(p, i).multiply(_scale)
    _b.fromBufferAttribute(p, i + 1).multiply(_scale).sub(_a)
    _d.fromBufferAttribute(p, i + 2).multiply(_scale).sub(_a)
    _b.cross(_d)
    const ax = Math.abs(_b.x), ay = Math.abs(_b.y), az = Math.abs(_b.z)
    const [u, w] = ax >= ay && ax >= az ? [2, 1] : ay >= az ? [0, 2] : [0, 1]
    for (let v = i; v < i + 3; v++) {
      _a.fromBufferAttribute(p, v).multiply(_scale)
      uv[v * 2] = _a.getComponent(u)
      uv[v * 2 + 1] = _a.getComponent(w)
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}
