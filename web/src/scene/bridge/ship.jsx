// <Ship />: a three-masted barque that needs the bascules up. Masts reach ~40 m above high water,
// well over the closed deck (9 m) but under the high walkways (44 m). Driven by the hydraulic sim,
// not keyframes: it waits downstream, sails west once the leaves pass 80% of max, and loops.
// Frame: metres, bridge centre origin, x east (downstream), y up, water at L.hw. Bow points west (-x).
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Part } from './Part.jsx'
import { beam, box, merge } from './geom.js'
import { L } from './structures.jsx'
import { pbr } from '../look/textures.js'

const WAIT_X = 250
const END_X = -300
const CRUISE = 9 // m/s; shortcut: brisk for the film (a real barque under the bridge did ~2-3 m/s)
const ACCEL = 0.6 // m/s²
const OPEN_FRACTION = 0.8

// Hull plan outline in (x, z): transom stern at +x, pointed bow at -x.
const hullShape = () => {
  const s = new THREE.Shape()
  s.moveTo(24, -3.6)
  s.lineTo(8, -4.6)
  s.lineTo(-12, -4.5)
  s.quadraticCurveTo(-24, -3.8, -29, 0)
  s.quadraticCurveTo(-24, 3.8, -12, 4.5)
  s.lineTo(8, 4.6)
  s.lineTo(24, 3.6)
  s.closePath()
  return s
}

// Extrude the plan vertically from y0 to y0+h, then pinch towards the keel and lift the bow (sheer).
function hullGeo(y0, h, grow = 1) {
  const g = new THREE.ExtrudeGeometry(hullShape(), { depth: h, bevelEnabled: false, curveSegments: 10 })
  g.rotateX(Math.PI / 2) // shape y -> z, extrusion -> -y
  g.translate(0, y0 + h, 0)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const t = THREE.MathUtils.clamp((y + 2.5) / 6.5, 0, 1)
    p.setZ(i, p.getZ(i) * (0.35 + 0.65 * Math.sqrt(t)) * grow)
    p.setX(i, x * grow)
    p.setY(i, y + Math.max(0, -x - 14) * 0.09 * t)
  }
  g.computeVertexNormals()
  return g
}

// Square sail hanging from a yard: trapezoid in the yz plane, bellied forward (-x) by the wind.
function sailGeo(yTop, yBot, wTop, wBot, belly) {
  const g = new THREE.PlaneGeometry(1, 1, 8, 6)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5
    const v = p.getY(i) + 0.5
    const w = wBot + (wTop - wBot) * v
    p.setXYZ(i, -belly * Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.15 + 0.85 * v)), yBot + (yTop - yBot) * v, (u - 0.5) * w)
  }
  g.computeVertexNormals()
  return g
}

const tri = (a, b, c) => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2))
  g.computeVertexNormals()
  return g
}

// x, mast top, and yards [height, width] bottom to top. Heights above the waterline.
const MASTS = [
  { x: -13, top: 38, yards: [[13, 19], [20.5, 16], [27, 12.5], [32.5, 9]] },
  { x: 1, top: 40, yards: [[13, 20], [21, 17], [28, 13], [34, 9.5]] },
  { x: 14, top: 35, yards: [[14, 15], [21, 12.5], [27, 9.5]] },
]
const DECK = 4
const BOWSPRIT = [-42, 9, 0]

function buildShip() {
  const spars = []
  const sails = []
  const lines = []
  const seg = (a, b) => lines.push(...a, ...b)
  for (const m of MASTS) {
    spars.push(beam([m.x, DECK - 1, 0], [m.x, m.top, 0], 0.45, 8))
    spars.push(box(1.6, 0.5, 2.6, m.x, m.yards[1][0] - 1.2, 0)) // top platform
    m.yards.forEach(([y, w], i) => {
      spars.push(beam([m.x, y, -w / 2], [m.x, y, w / 2], 0.2, 6))
      const below = i ? m.yards[i - 1] : [DECK + 2.5, w * 0.9]
      sails.push(sailGeo(y - 0.3, below[0] + 0.4, w * 0.96, below[1] * 0.92, 1.4 - i * 0.2).translate(m.x + 0.4, 0, 0))
      seg([m.x, y, -w / 2], [m.x - 0.6, below[0], -below[1] * 0.45]) // sheets
      seg([m.x, y, w / 2], [m.x - 0.6, below[0], below[1] * 0.45])
    })
    // shrouds and ratlines-ish backstays, port and starboard
    for (const z of [-1, 1]) {
      const head = [m.x, m.yards[1][0] - 1, 0]
      for (const dx of [-1.5, 0, 1.5]) seg(head, [m.x + dx + 2, DECK + 0.6, z * 4.4])
      seg([m.x, m.top - 0.5, 0], [m.x + 9, DECK + 0.6, z * 4.2])
    }
  }
  // fore-and-aft stays: mast heads to the next mast's foot, and the forestays to the bowsprit
  seg([MASTS[1].x, MASTS[1].top - 1, 0], [MASTS[0].x, MASTS[0].yards[1][0], 0])
  seg([MASTS[2].x, MASTS[2].top - 1, 0], [MASTS[1].x, MASTS[1].yards[1][0], 0])
  seg([MASTS[0].x, MASTS[0].top - 1, 0], BOWSPRIT)
  seg([MASTS[0].x, MASTS[0].yards[2][0], 0], [-34, 7.2, 0])
  seg(BOWSPRIT, [-27, 1, 0]) // bobstay
  spars.push(beam([-24, 6.2, 0], BOWSPRIT, 0.3, 6))
  // jibs on the forestays
  sails.push(tri([MASTS[0].x - 1, 30, 0], [-38, 8.6, 0], [-22, 8.5, 0]))
  sails.push(tri([MASTS[0].x - 1, 22, 0.2], [-32, 7.4, 0.2], [-19, 7.5, 0.2]))
  // spanker gaff and boom on the mizzen
  spars.push(beam([MASTS[2].x, 12, 0], [MASTS[2].x + 11, 14.5, 0], 0.18))
  spars.push(beam([MASTS[2].x, DECK + 2.5, 0], [MASTS[2].x + 12, DECK + 2.5, 0], 0.2))
  sails.push(
    tri([MASTS[2].x + 0.4, 12, 0], [MASTS[2].x + 11, 14.5, 0], [MASTS[2].x + 12, DECK + 2.7, 0]),
    tri([MASTS[2].x + 0.4, 12, 0], [MASTS[2].x + 12, DECK + 2.7, 0], [MASTS[2].x + 0.4, DECK + 2.7, 0]),
  )
  // ensign staff at the transom
  spars.push(beam([24.5, DECK, 0], [26.5, DECK + 7, 0], 0.12))
  const rig = new THREE.BufferGeometry()
  rig.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
  const deck = new THREE.ShapeGeometry(hullShape(), 10).rotateX(Math.PI / 2)
  deck.attributes.position.array.forEach((_, i, a) => i % 3 === 1 && (a[i] = DECK + 0.02))
  deck.scale(0.97, 1, 0.94)
  return {
    hull: hullGeo(-2.5, 6.5),
    band: hullGeo(2.4, 0.7, 1.025),
    deck,
    works: merge([box(7, 2.2, 4.5, 18, DECK + 1.1, 0), box(5, 1.6, 3.6, -5, DECK + 0.8, 0), box(2, 1.4, 2, 20, DECK + 2.9, 0)]),
    spars: merge(spars),
    sails: merge(sails),
    rig,
  }
}

// Red ensign: red field, Union Flag canton. Drawn once on a small canvas.
function ensignTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const x = c.getContext('2d')
  x.fillStyle = '#c8102e'
  x.fillRect(0, 0, 128, 64)
  x.fillStyle = '#012169'
  x.fillRect(0, 0, 64, 32)
  x.strokeStyle = '#fff'
  x.lineWidth = 7
  x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 32); x.moveTo(64, 0); x.lineTo(0, 32); x.stroke()
  x.strokeStyle = '#c8102e'
  x.lineWidth = 2.5
  x.stroke()
  x.fillStyle = '#fff'
  x.fillRect(26, 0, 12, 32); x.fillRect(0, 11, 64, 10)
  x.fillStyle = '#c8102e'
  x.fillRect(29, 0, 6, 32); x.fillRect(0, 13.5, 64, 5)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Soft foam streak: opaque at the stern, fading aft and towards the edges.
function foamTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 32
  const x = c.getContext('2d')
  const img = x.createImageData(128, 32)
  for (let i = 0; i < 128; i++)
    for (let j = 0; j < 32; j++) {
      const edge = 1 - Math.abs(j - 15.5) / 16
      const a = (1 - i / 128) ** 1.5 * edge ** 0.6 * (0.6 + 0.4 * Math.random())
      img.data.set([255, 255, 255, a * 255], (j * 128 + i) * 4)
    }
  x.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(c)
}

// Live ship state (one ship), for a panel or a test harness that wants to place it. x is metres east.
export const shipState = { x: WAIT_X, v: 0, sailing: false }

export function Ship({ rt, maxAngle }) {
  const geo = useMemo(buildShip, [])
  const mats = useMemo(
    () => ({
      hull: new THREE.MeshStandardMaterial({ ...pbr('wood:dark', 0.08), color: '#3a3a3a' }),
      band: new THREE.MeshStandardMaterial({ color: '#e8e1cf', roughness: 0.6 }),
      deck: new THREE.MeshStandardMaterial({ ...pbr('wood:dark', 0.15), color: '#d8b58a' }),
      spars: new THREE.MeshStandardMaterial({ ...pbr('wood:dark', 0.5), color: '#c49a6c' }),
      sails: new THREE.MeshStandardMaterial({ color: '#f1e8d2', roughness: 0.95, side: THREE.DoubleSide }),
      flag: new THREE.MeshStandardMaterial({ map: ensignTexture(), roughness: 0.8, side: THREE.DoubleSide }),
      rig: new THREE.LineBasicMaterial({ color: '#2a2420' }),
      foam: new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, depthWrite: false, opacity: 0 }),
    }),
    [],
  )
  const move = useRef()
  const bob = useRef()
  const flag = useRef()
  const wake = useRef()

  useFrame(({ clock }, dt) => {
    dt = Math.min(dt, 0.1)
    const s = shipState
    if (!s.sailing && rt.sim.angle > OPEN_FRACTION * maxAngle) s.sailing = true
    if (s.sailing) {
      s.v = Math.min(CRUISE, s.v + ACCEL * dt)
      s.x -= s.v * dt
      if (s.x < END_X) Object.assign(s, { x: WAIT_X, v: 0, sailing: false }) // off-screen: back to the queue
    }
    const t = clock.elapsedTime
    move.current.position.set(s.x, L.hw, 0)
    bob.current.position.y = Math.sin(t * 0.9) * 0.25
    bob.current.rotation.x = Math.sin(t * 0.55) * 0.035 // roll
    bob.current.rotation.z = Math.sin(t * 0.4 + 1) * 0.012 // pitch
    flag.current.rotation.y = Math.sin(t * 3.1) * 0.25
    const k = s.v / CRUISE
    wake.current.children.forEach((m) => (m.material.opacity = 0.15 + 0.55 * k))
    wake.current.scale.x = 0.4 + 0.6 * k
  })

  return (
    <group ref={move}>
      <group ref={bob}>
        <Part id="ship" rt={rt}>
          <mesh geometry={geo.hull} material={mats.hull} castShadow receiveShadow />
          <mesh geometry={geo.band} material={mats.band} />
          <mesh geometry={geo.deck} material={mats.deck} receiveShadow />
          <mesh geometry={geo.works} material={mats.deck} castShadow />
          <mesh geometry={geo.spars} material={mats.spars} castShadow />
          <mesh geometry={geo.sails} material={mats.sails} castShadow />
          <lineSegments geometry={geo.rig} material={mats.rig} />
          <group ref={flag} position={[26.4, DECK + 6.2, 0]}>
            <mesh position={[1.6, 0, 0]} material={mats.flag}>
              <planeGeometry args={[3.2, 1.6]} />
            </mesh>
          </group>
        </Part>
      </group>
      {/* wake trails behind the stern; bow waves fan out from the stem */}
      <group ref={wake} position={[0, 0.06, 0]}>
        <mesh rotation-x={-Math.PI / 2} position={[23 + 35, 0, 0]} material={mats.foam}>
          <planeGeometry args={[70, 10]} />
        </mesh>
        {[-1, 1].map((z) => (
          <mesh key={z} rotation={[-Math.PI / 2, 0, -z * 0.32]} position={[-7, 0, z * 7.2]} material={mats.foam}>
            <planeGeometry args={[46, 3]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
