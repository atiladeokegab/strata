// <OpeningDay />: the bridge dressed for its opening by the Prince of Wales, 30 June 1894 (year 1894 only).
// Sources: The Times, 2 July 1894 (reprinted at forgottenvictorians.com, "Opening ceremony for Tower
// Bridge"): a ceremonial pavilion with an awning "in broad stripes of pink and green ... and of creamy
// white", and clusters of flags. The National Archives (C9455686): ships dressed with flags for the day.
// status: inferred. Neither source places flags on the turrets or bunting on the walkways; the Union
// Flags on the turret finials, the red/white/blue walkway bunting and the pink/green/cream strings
// between the turrets (colours borrowed from the Times' awning) are illustrative.
// Draws 2 calls: staffs in the shared iron, every flag and pennant in one flag material (a canvas atlas).
// Phones (LITE) get the turret flags only.
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { beam, merge, M } from './geom.js'
import { L } from './structures.jsx'
import { WALK } from './walkway.js'
import { LITE } from '../look/tier.js'

// atlas 256x64: Union Flag on the left half, eight solid swatches on the right
const SWATCH = ['#c8102e', '#f4f1ea', '#012169', '#e9a7b4', '#7fae84', '#efe4c6', '#c9a227', '#a3121f']
const RWB = [0, 1, 2], AWNING = [3, 4, 5] // swatch indices
function atlasTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const x = c.getContext('2d')
  x.fillStyle = '#012169'
  x.fillRect(0, 0, 128, 64)
  x.strokeStyle = '#fff'
  x.lineWidth = 13
  x.beginPath(); x.moveTo(0, 0); x.lineTo(128, 64); x.moveTo(128, 0); x.lineTo(0, 64); x.stroke()
  x.strokeStyle = '#c8102e'
  x.lineWidth = 4.5
  x.stroke()
  x.fillStyle = '#fff'
  x.fillRect(52, 0, 24, 64); x.fillRect(0, 22, 128, 20)
  x.fillStyle = '#c8102e'
  x.fillRect(57, 0, 14, 64); x.fillRect(0, 26, 128, 12)
  SWATCH.forEach((s, i) => ((x.fillStyle = s), x.fillRect(128 + i * 16, 0, 16, 64)))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Union Flag 2.4 x 1.2 m, hoist at (x, y, z), flying east with a baked ripple
function flag(x, y, z) {
  const g = new THREE.PlaneGeometry(2.4, 1.2, 6, 2)
  const p = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 1.2
    p.setXYZ(i, x + u, y + p.getY(i), z + Math.sin(u * 2.4) * 0.12 * u)
    uv.setX(i, uv.getX(i) * 0.5)
  }
  g.computeVertexNormals()
  return g
}

// A string of pennants from a to b, sagging by `sag`, every ~1 m, cycling colours; faces along `n`.
function bunting(out, a, b, sag, cols) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), along = B.clone().sub(A)
  const n = Math.max(2, Math.round(along.length()))
  const side = along.clone().setY(0).normalize().multiplyScalar(0.3)
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, c = A.clone().addScaledVector(along, t)
    c.y -= sag * Math.sin(Math.PI * t)
    const u = (128 + cols[i % cols.length] * 16 + 8) / 256
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([...c.clone().sub(side).toArray(), ...c.clone().add(side).toArray(), c.x, c.y - 0.7, c.z], 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u, 0.5, u, 0.5, u, 0.5], 2))
    g.setIndex([0, 1, 2])
    g.computeVertexNormals()
    out.push(g)
  }
}

export function OpeningDay() {
  const g = useMemo(() => {
    const cloth = [], staff = [], top = 59.45, tip = 64
    for (const tz of [L.pierZ, -L.pierZ]) {
      const staffs = [[-12, -9], [12, -9], [12, 9], [-12, 9]].map(([x, dz]) => [x, tz + dz])
      for (const [x, z] of staffs) {
        staff.push(beam([x, top, z], [x, tip, z], 0.06, 5))
        cloth.push(flag(x + 0.06, tip - 0.7, z))
      }
      if (!LITE) for (let i = 0; i < 4; i++) {
        const [x0, z0] = staffs[i], [x1, z1] = staffs[(i + 1) % 4]
        bunting(cloth, [x0, tip - 0.2, z0], [x1, tip - 0.2, z1], 2.2, AWNING)
      }
    }
    // along both outer faces of each high walkway, hung from the roof boom in 8 m swags
    if (!LITE) {
      const ze = -(L.pierZ + L.towerHalfZ), y = L.walkY + L.walkH - 0.2
      for (const x of [-L.walkX - WALK.w - 0.1, L.walkX + WALK.w + 0.1])
        for (let z = -ze; z < ze - 0.01; z += (2 * ze) / 9) bunting(cloth, [x, y, z], [x, y, z + (2 * ze) / 9], 0.9, RWB)
    }
    return { staff: merge(staff), cloth: mergeGeometries(cloth) } // cloth keeps its atlas UVs (merge would box-project them)
  }, [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: atlasTexture(), roughness: 0.85, side: THREE.DoubleSide }), [])
  return (
    <>
      <mesh geometry={g.staff} material={M.iron} castShadow />
      <mesh geometry={g.cloth} material={mat} castShadow />
    </>
  )
}
