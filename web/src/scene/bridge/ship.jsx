// <Ship />: the year's vessel (vessels.js); the 1894 one is a three-masted barque that needs the bascules up. Masts reach ~40 m above high water,
// well over the closed deck (9 m) but under the high walkways (44 m). Driven by the hydraulic sim,
// not keyframes: it waits downstream, sails west once the leaves pass 80% of max, and loops.
// Frame: metres, bridge centre origin, x east (downstream), y up, water at L.hw. Bow points west (-x).
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Part } from './Part.jsx'
import { beam, box, merge } from './geom.js'
import { L } from './structures.jsx'
import { createShip, stepShip, CRUISE } from './shipSim.js'
import { lift, liftSpeed, applyShipWarp } from './liftSequence.js'
import { vesselForYear, leafInput } from './vessels.js'
import { RiverCraft } from './river.jsx'


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
export const shipState = createShip()

// Look.jsx textures wood by kind; the colour is the old tint times the wood:dark map it used to carry.
const timber = (color) => Object.assign(new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08 }), { userData: { kind: 'timber' } })
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra })

function Barque({ mats }) {
  const geo = useMemo(buildShip, [])
  return (
    <>
      <mesh geometry={geo.hull} material={mats.hull} castShadow receiveShadow />
      <mesh geometry={geo.band} material={mats.band} />
      <mesh geometry={geo.deck} material={mats.deck} receiveShadow />
      <mesh geometry={geo.works} material={mats.deck} castShadow />
      <mesh geometry={geo.spars} material={mats.spars} castShadow />
      <mesh geometry={geo.sails} material={mats.sails} castShadow />
      <lineSegments geometry={geo.rig} material={mats.rig} />
    </>
  )
}

// Steam tug (~26 m) towing a dumb lighter 30 m astern. Funnel top ~10 m, mast ~14 m.
function Tug({ mats }) {
  const geo = useMemo(
    () => ({
      hull: hullGeo(-2.5, 6.5).scale(0.5, 0.6, 0.72),
      band: hullGeo(2.4, 0.7, 1.025).scale(0.5, 0.6, 0.72),
      house: merge([box(6, 2.6, 4, 1, 3.7, 0), box(3.2, 1.8, 3.4, -2.5, 5.9, 0)]),
      glass: box(3.3, 0.6, 3.5, -2.5, 6.2, 0),
      funnel: beam([2.5, 4, 0], [3, 9.4, 0], 0.9, 14),
      funnelTop: beam([3, 8.6, 0], [3.05, 10, 0], 0.93, 14),
      mast: merge([beam([-6, 2.4, 0], [-6.2, 14, 0], 0.12), beam([-6.1, 9, -1.6], [-6.1, 9, 1.6], 0.06)]),
      lighter: merge([box(30, 2.6, 8, 52, -0.4, 0), box(26, 0.4, 6.6, 52, 1.1, 0)]),
      tow: beam([11, 2.2, 0], [37, 1, 0], 0.06, 4),
    }),
    [],
  )
  return (
    <>
      <mesh geometry={geo.hull} material={mats.black} castShadow />
      <mesh geometry={geo.band} material={mats.red} />
      <mesh geometry={geo.house} material={mats.white} castShadow />
      <mesh geometry={geo.glass} material={mats.glass} />
      <mesh geometry={geo.funnel} material={mats.buff} castShadow />
      <mesh geometry={geo.funnelTop} material={mats.black} />
      <mesh geometry={geo.mast} material={mats.spars} />
      <mesh geometry={geo.lighter} material={mats.rust} castShadow receiveShadow />
      <mesh geometry={geo.tow} material={mats.rope} />
    </>
  )
}

// Motor coaster (~45 m): bridge and funnel aft, cargo mast and derrick forward. Mast ~22 m.
function Coaster({ mats }) {
  const geo = useMemo(
    () => ({
      hull: hullGeo(-2.5, 6.5).scale(0.85, 0.8, 1.15),
      boot: hullGeo(-2.5, 2.6, 1.02).scale(0.85, 0.8, 1.15),
      house: merge([box(9, 3, 8.5, 14, 4.7, 0), box(6, 2.6, 9.6, 13, 7.5, 0)]),
      glass: box(6.1, 0.8, 9.7, 13, 7.9, 0),
      hatch: box(22, 1.2, 6.4, -6, 3.8, 0),
      funnel: box(2.6, 4.6, 2.2, 17.5, 9, 0),
      mast: merge([beam([-17, 3, 0], [-17, 22, 0], 0.3), beam([-17, 4, 0], [-9, 9, 0], 0.18), beam([12, 8.8, 0], [12, 14, 0], 0.1)]),
    }),
    [],
  )
  return (
    <>
      <mesh geometry={geo.hull} material={mats.navy} castShadow />
      <mesh geometry={geo.boot} material={mats.red} />
      <mesh geometry={geo.house} material={mats.white} castShadow />
      <mesh geometry={geo.glass} material={mats.glass} />
      <mesh geometry={geo.hatch} material={mats.green} />
      <mesh geometry={geo.funnel} material={mats.red} castShadow />
      <mesh geometry={geo.mast} material={mats.buff} castShadow />
    </>
  )
}

// Thames Clipper catamaran (~37 m): twin slim hulls, glazed cabin. Air draft ~6 m.
function Clipper({ mats }) {
  const geo = useMemo(
    () => ({
      hulls: merge([-3.4, 3.4].map((z) => hullGeo(-2.5, 6.5).scale(0.7, 0.42, 0.22).translate(0, 0, z))),
      deck: box(32, 0.9, 9.4, -1, 2.2, 0),
      cabin: box(24, 2.6, 8.4, -1.5, 3.9, 0),
      glass: box(24.2, 1.1, 8.6, -1.5, 4.3, 0),
      roof: merge([box(25, 0.3, 8.8, -1.5, 5.3, 0), beam([4, 5.4, 0], [4.4, 6.6, 0], 0.08)]),
    }),
    [],
  )
  return (
    <>
      <mesh geometry={geo.hulls} material={mats.navy} castShadow />
      <mesh geometry={geo.deck} material={mats.white} castShadow />
      <mesh geometry={geo.cabin} material={mats.white} castShadow />
      <mesh geometry={geo.glass} material={mats.glass} />
      <mesh geometry={geo.roof} material={mats.navy} />
    </>
  )
}

const MESH = { barque: Barque, tug: Tug, coaster: Coaster, clipper: Clipper }
const FLAG_AT = { barque: [26.4, DECK + 6.2, 0], tug: [12.2, 4.6, 0], coaster: [21, 6, 0], clipper: [15, 3.8, 0] }
const PUFFS = 7
const PUFF = new THREE.IcosahedronGeometry(1, 1) // shared by every puff

export function Ship({ rt, year, maxAngle }) {
  const vessel = vesselForYear(year)
  const Mesh = MESH[vessel.kind]
  const mats = useMemo(
    () => ({
      hull: timber('#0f0906'),
      band: std('#e8e1cf'),
      deck: timber('#381d0f'),
      spars: timber('#33190b'),
      sails: std('#f1e8d2', { roughness: 0.95, side: THREE.DoubleSide }),
      flag: std('#ffffff', { map: ensignTexture(), roughness: 0.8, side: THREE.DoubleSide }),
      rig: new THREE.LineBasicMaterial({ color: '#2a2420' }),
      black: std('#1d1d1f', { roughness: 0.5 }),
      red: std('#9b2b20'),
      white: std('#efefe9', { roughness: 0.45 }),
      buff: std('#c9a560'),
      rust: std('#6e3b22', { roughness: 0.85, metalness: 0.2 }),
      rope: std('#3a3026', { roughness: 0.9 }),
      navy: std('#1b2a4a', { roughness: 0.35, metalness: 0.3 }),
      green: std('#3f5a3a', { roughness: 0.8 }),
      glass: std('#1a2430', { roughness: 0.1, metalness: 0.7 }),
      foam: new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, depthWrite: false, opacity: 0 }),
      smoke: Array.from({ length: PUFFS }, () => new THREE.MeshBasicMaterial({ color: '#4a4744', transparent: true, depthWrite: false })),
    }),
    [],
  )
  const move = useRef()
  const bob = useRef()
  const flag = useRef()
  const wake = useRef()
  const smoke = useRef()

  useFrame(({ clock }, dt) => {
    dt = Math.min(dt, 0.1)
    const s = shipState
    applyShipWarp(lift, s, CRUISE)
    const sdt = dt * liftSpeed()
    stepShip(s, leafInput(vessel, rt.sim.angle / maxAngle), sdt)
    const t = clock.elapsedTime
    move.current.position.set(s.x, L.hw, 0)
    bob.current.position.y = Math.sin(t * 0.9) * 0.25
    bob.current.rotation.x = Math.sin(t * 0.55) * 0.035 // roll
    bob.current.rotation.z = Math.sin(t * 0.4 + 1) * 0.012 // pitch
    flag.current.rotation.y = Math.sin(t * 3.1) * 0.25
    const k = s.v / CRUISE
    wake.current.children.forEach((m) => (m.material.opacity = 0.15 + 0.55 * k))
    wake.current.scale.x = 0.4 + 0.6 * k
    // funnel smoke: puffs rise, swell and fade, streaming aft with the ship's way
    smoke.current?.children.forEach((p, i) => {
      const age = (t * 0.35 + i / PUFFS) % 1
      p.position.set(3 + age * (4 + s.v * 2.2), 10 + age * 9, Math.sin(i * 2.1) * age * 2)
      p.scale.setScalar(0.8 + age * 3.2)
      p.material.opacity = 0.55 * (1 - age)
    })
  })

  return (
    <>
    <group ref={move}>
      <group ref={bob}>
        <Part id="ship" rt={rt}>
          <Mesh mats={mats} />
          <group ref={flag} position={FLAG_AT[vessel.kind]}>
            <mesh position={[1.6, 0, 0]} material={mats.flag}>
              <planeGeometry args={[3.2, 1.6]} />
            </mesh>
          </group>
        </Part>
        {vessel.kind === 'tug' && (
          <group ref={smoke}>
            {mats.smoke.map((m, i) => (
              <mesh key={i} material={m} geometry={PUFF} />
            ))}
          </group>
        )}
      </group>
      {/* wake trails behind the stern; bow waves fan out from the stem */}
      <group ref={wake} position={[0, 0.06, 0]}>
        <mesh rotation-x={-Math.PI / 2} position={[(vessel.hullStern ?? vessel.stern) + 35, 0, 0]} material={mats.foam}>
          <planeGeometry args={[70, 10]} />
        </mesh>
        {[-1, 1].map((z) => (
          <mesh key={z} rotation={[-Math.PI / 2, 0, -z * 0.32]} position={[Math.max(vessel.bow, -29) + 21.8, 0, z * 7.2]} material={mats.foam}>
            <planeGeometry args={[46, 3]} />
          </mesh>
        ))}
      </group>
    </group>
    <RiverCraft year={year} ship={shipState} vessel={vessel} />
    </>
  )
}
