// node src/scene/look/uvs.check.mjs: Look's metre UVs must not smear on smooth-shaded round parts.
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { worldUVs } from './uvs.js'
import './grade.check.mjs' // check-web runs this file; the grade check rides along

// The engine-house chimney shape: a smooth 4-sided tapering column turned 45 deg, so its vertex normals are diagonal.
const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.75, 30, 4, 1).rotateY(Math.PI / 4))
mesh.scale.set(2, 1, 2)
mesh.updateMatrixWorld()
worldUVs(mesh)
const g = mesh.geometry
assert.equal(g.index, null)
const p = g.attributes.position, uv = g.attributes.uv
for (let i = 0; i < p.count; i += 3) {
  // UV distance between triangle corners must equal their world distance in the face plane (no stretch)
  for (const [a, b] of [[i, i + 1], [i, i + 2], [i + 1, i + 2]]) {
    const pa = new THREE.Vector3().fromBufferAttribute(p, a).multiply(mesh.scale)
    const pb = new THREE.Vector3().fromBufferAttribute(p, b).multiply(mesh.scale)
    const du = Math.hypot(uv.getX(a) - uv.getX(b), uv.getY(a) - uv.getY(b))
    const d = pa.distanceTo(pb)
    assert.ok(Math.abs(du - d) < 0.05 * d + 1e-6, `stretch at ${a}-${b}: uv ${du.toFixed(2)} vs ${d.toFixed(2)} m`)
  }
}
console.log('uvs.check: ok')
