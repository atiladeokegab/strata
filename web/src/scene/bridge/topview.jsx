// <TopView />: what the sky view adds. Clickable part callouts with leader lines (placed by the
// pure placeLabels so they never overlap, hidden when the camera is far), a 50 m scale bar, a
// north arrow, a faint swing envelope for each bascule drawn flat on the water, the hydraulic
// mains with a live pressure chip, and the ship's track and road gates as dashed lines.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../../store.js'
import { shown } from './stages.js'
import { L } from './structures.jsx'
import { CALLOUTS, labelSize, placeLabels } from './callouts.js'
import { box, merge } from './geom.js'
import { OPEN_TIME_S, PRESSURE_PSI } from './hydraulics.js'
import { WAIT_X, END_X } from './shipSim.js'
import { GATE_U } from './trafficSim.js'

const FAR = 900 // metres from the bridge centre beyond which callouts hide
const WATER = L.hw + 0.25
const v = new THREE.Vector3()

function Callouts({ stage, select }) {
  const { camera, size } = useThree()
  const group = useRef()
  const els = useRef({})
  const items = useMemo(
    () => CALLOUTS.filter((c) => shown(c.kind, stage)).map((c) => ({ ...c, ...labelSize(c.label), at: new THREE.Vector3(...c.pos) })),
    [stage],
  )

  useFrame(() => {
    const m = group.current.matrixWorld
    const far = camera.position.distanceTo(v.setFromMatrixPosition(m)) > FAR
    const pts = items.map((it) => {
      v.copy(it.at).applyMatrix4(m).project(camera)
      const behind = v.z > 1
      return { id: it.id, w: it.w, h: it.h, x: behind ? -1 : ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height }
    })
    const spots = far ? {} : placeLabels(pts, size.width, size.height)
    for (const it of items) {
      const e = els.current[it.id]
      if (!e?.root || !e.line || !e.btn) continue
      const s = spots[it.id]
      e.root.style.display = s ? '' : 'none'
      if (!s) continue
      e.line.setAttribute('x2', s.dx)
      e.line.setAttribute('y2', s.dy)
      e.btn.style.transform = `translate(calc(${s.dx}px - 50%), calc(${s.dy}px - 50%))`
    }
  })

  return (
    <group ref={group}>
      {items.map((it) => (
        <Html key={it.id} position={it.pos} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <div ref={(r) => r && ((els.current[it.id] ??= {}).root = r)} style={{ display: 'none' }}>
            <svg width="1" height="1" style={{ position: 'absolute', overflow: 'visible' }} aria-hidden="true">
              <circle r="3" fill="#f3efe6" stroke="#0c1016" />
              <line ref={(r) => r && ((els.current[it.id] ??= {}).line = r)} stroke="#f3efe6" strokeWidth="1.2" />
            </svg>
            <button
              type="button"
              ref={(r) => r && ((els.current[it.id] ??= {}).btn = r)}
              onClick={() => select(it.id)}
              style={{ ...LABEL, position: 'absolute', left: 0, top: 0, width: it.w, pointerEvents: 'auto' }}
            >
              {it.label}
            </button>
          </div>
        </Html>
      ))}
    </group>
  )
}

// 50 m bar in 10 m black and white blocks, a north arrow (north is -z in the bridge frame)
function MapMarks() {
  const g = useMemo(() => {
    const black = [], white = []
    for (let i = 0; i < 5; i++) (i % 2 ? white : black).push(box(10, 0.2, 2, 55 + i * 10, WATER, 70))
    const arrow = new THREE.Shape([new THREE.Vector2(0, -12), new THREE.Vector2(4, 0), new THREE.Vector2(0, -3), new THREE.Vector2(-4, 0)])
    const tip = new THREE.ShapeGeometry(arrow).rotateX(Math.PI / 2).translate(105, WATER + 0.1, 40)
    return { black: merge([...black, tip]), white: merge(white) }
  }, [])
  return (
    <>
      <mesh geometry={g.black} material={INK} />
      <mesh geometry={g.white} material={PAPER} />
      <Html position={[80, WATER, 75]} center style={{ pointerEvents: 'none' }}>
        <div style={TAG}>50 m</div>
      </Html>
      <Html position={[105, WATER, 24]} center style={{ pointerEvents: 'none' }}>
        <div style={{ ...TAG, fontWeight: 700 }}>N</div>
      </Html>
    </>
  )
}

// Each leaf sweeps up to maxAngle about its pivot; drawn rabatted onto the water like a door
// swing: the closed leaf's 18 m wide footprint plus the sector its outer edge sweeps.
function SwingGhosts({ maxAngle }) {
  const geo = useMemo(() => {
    const r = -L.pivotZ, half = 9
    // north leaf: pivot at z=pivotZ, tip at z=0; the sector hinges on its east edge
    const leaf = (sign) => {
      const foot = new THREE.PlaneGeometry(half * 2, r).rotateX(-Math.PI / 2).translate(0, WATER - 0.05, sign * (L.pivotZ / 2))
      const fan = new THREE.CircleGeometry(r, 48, 0, maxAngle).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2).translate(half, WATER - 0.05, L.pivotZ)
      const arc = new THREE.RingGeometry(r - 0.6, r, 48, 1, 0, maxAngle).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2).translate(half, WATER, L.pivotZ)
      if (sign < 0) [fan, arc].forEach((g) => g.rotateY(Math.PI)) // south half is the north turned 180°
      return { fill: [foot, fan], edge: [arc] }
    }
    const n = leaf(1), so = leaf(-1)
    return { fill: merge([...n.fill, ...so.fill]), edge: merge([...n.edge, ...so.edge]) }
  }, [maxAngle])
  return (
    <>
      <mesh geometry={geo.fill} material={GHOST} renderOrder={1} />
      <mesh geometry={geo.edge} material={GHOST_EDGE} renderOrder={1} />
    </>
  )
}

// Hydraulic mains in plan: engine room -> approach main -> south pier, then under the river to
// the north pier. Same cyan glow and running dashes as the engine room's Flow, driven the same way.
const OMEGA_MAX = (86 * Math.PI) / 180 / OPEN_TIME_S
// shortcut: schematic, drawn 13 m east of the centreline so the deck does not hide it (the real
// mains run under the approach at x 7.4 and along the riverbed at x 0)
const MX = 17
const MAINS = [[37, 151], [MX, 151], [MX, -L.pierZ], [MX, L.pierZ]]
const DASH_M = 4
function ribbons(pts, w) {
  const gs = []
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i]
    const len = Math.hypot(x1 - x0, z1 - z0)
    const g = new THREE.PlaneGeometry(len, w).rotateX(-Math.PI / 2)
    const uv = g.attributes.uv
    for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * (len / DASH_M))
    gs.push(g.rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, WATER + 0.15, (z0 + z1) / 2))
  }
  return merge(gs)
}
let DASH
function dashTexture() {
  if (!DASH) {
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 4 })
    const x = c.getContext('2d'), grad = x.createLinearGradient(0, 0, 64, 0)
    grad.addColorStop(0, '#163a48'); grad.addColorStop(0.35, '#fff'); grad.addColorStop(0.55, '#fff'); grad.addColorStop(0.7, '#163a48')
    x.fillStyle = grad
    x.fillRect(0, 0, 64, 4)
    DASH = new THREE.CanvasTexture(c)
    DASH.wrapS = THREE.RepeatWrapping
  }
  return DASH
}
function Mains({ sim }) {
  const geo = useMemo(() => ribbons(MAINS, 2.2), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#5fd4ff', map: dashTexture(), transparent: true, depthWrite: false }), [])
  const chip = useRef()
  useFrame((_, dt) => {
    const drive = Math.min(1, Math.abs(sim.omega) / OMEGA_MAX)
    const supply = Math.min(1, drive + (sim.pumping ? 0.35 : 0))
    mat.opacity = 0.35 + 0.65 * supply
    mat.map.offset.x -= (0.15 + supply * 1.2) * Math.min(dt, 0.1) // dashes run engine room -> north pier
    if (chip.current) {
      const psi = sim.stored > 0 ? `${PRESSURE_PSI} psi` : 'pumps only'
      chip.current.textContent = `${psi} · stored ${Math.round(sim.stored * 100)}% · ${sim.pumping ? 'pumping' : 'pumps idle'}`
    }
  })
  return (
    <>
      <mesh geometry={geo} material={mat} renderOrder={2} />
      <Html position={[72, 8, 156]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div ref={chip} style={{ ...TAG, border: '1px solid rgba(95,212,255,0.5)' }} aria-live="off" />
      </Html>
    </>
  )
}

// The ship's track down the river centreline and the road gates, as faint dashed lines; the
// gates sit inside the towers, so they draw over them (over).
function Dashed({ pts, color, dash = 4, y = WATER + 0.2, over = false }) {
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, y, z)))
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: dash, transparent: true, opacity: over ? 0.9 : 0.6, depthTest: !over }))
    l.renderOrder = over ? 3 : 0
    l.computeLineDistances()
    return l
  }, [pts, color, dash, y, over])
  return <primitive object={line} />
}
const TRACK = [[WAIT_X, 0], [END_X, 0]]
const GATES = [-1, 1].map((d) => [[-16, d * GATE_U], [16, d * GATE_U]]) // a little wider than the deck so they show past the labels

export function TopView({ stage, maxAngle, sim }) {
  const view = useStore((s) => s.view)
  const select = useStore((s) => s.select)
  if (view !== 'top') return null
  return (
    <>
      <Callouts stage={stage} select={select} />
      <MapMarks />
      {shown('bascule', stage) && <SwingGhosts maxAngle={maxAngle} />}
      {shown('engine', stage) && <Mains sim={sim} />}
      {stage >= 5 && (
        <>
          <Dashed pts={TRACK} color="#f3efe6" dash={6} />
          {GATES.map((g, i) => <Dashed key={i} pts={g} color="#ff6b5a" dash={1.2} y={0.6} over />)}
        </>
      )}
    </>
  )
}

const INK = new THREE.MeshBasicMaterial({ color: '#15191f', side: THREE.DoubleSide })
const PAPER = new THREE.MeshBasicMaterial({ color: '#f3efe6' })
const GHOST = new THREE.MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })
const GHOST_EDGE = new THREE.MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })

const TAG = {
  padding: '2px 6px',
  borderRadius: 4,
  background: 'rgba(12,16,22,0.72)',
  color: '#f3efe6',
  font: '500 12px/1.2 system-ui, sans-serif',
  whiteSpace: 'nowrap',
}
const LABEL = {
  ...TAG,
  height: 22,
  border: '1px solid rgba(255,255,255,0.18)',
  cursor: 'pointer',
  textAlign: 'center',
  padding: '0 6px',
}
