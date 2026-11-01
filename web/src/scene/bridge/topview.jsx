// <TopView />: what the sky view adds. Clickable part callouts with leader lines (placed by the
// pure placeLabels so they never overlap, hidden when the camera is far), a 50 m scale bar, a
// north arrow, a faint swing envelope for each bascule drawn flat on the water, the hydraulic
// mains with a live pressure chip, the ship's track and road gates as dashed lines, a live leaf
// angle beside each swing band, and in 1886-1893 the pier works in plan with a build caption.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../../store.js'
import { shown } from './stages.js'
import { L, pierShape } from './structures.jsx'
import { CALLOUTS, labelSize, placeLabels, buildDone } from './callouts.js'
import { box, merge } from './geom.js'
import { OPEN_TIME_S, PRESSURE_PSI } from './hydraulics.js'
import { WAIT_X, END_X } from './shipSim.js'
import { GATE_U } from './trafficSim.js'
import { gatesClosed } from './liftSequence.js'

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

// Live leaf angle beside each band (both leaves share one sim). North band lies east of the
// north leaf; the south half is turned 180°, so its band lies west.
function LeafAngles({ sim }) {
  const tags = useRef([])
  useFrame(() => {
    const deg = `${Math.round((sim.angle * 180) / Math.PI)}°`
    tags.current.forEach((t, i) => t && (t.textContent = `${i ? 'S' : 'N'} leaf ${deg}`))
  })
  return [[34, -12], [-34, 12]].map(([x, z], i) => (
    <Html key={i} position={[x, WATER, z]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <div ref={(r) => (tags.current[i] = r)} style={{ ...TAG, border: '1px solid rgba(255,181,71,0.6)' }} />
    </Html>
  ))
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
function Dashed({ pts, color, dash = 4, y = WATER + 0.2, over = false, live = null }) {
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, y, z)))
    // over: drawn last, untoned and through the towers, so red reads red from the sky
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: dash, transparent: true, opacity: over ? 1 : 0.6, depthTest: !over, toneMapped: !over }))
    l.renderOrder = over ? 10 : 0
    l.computeLineDistances()
    return l
  }, [pts, color, dash, y, over])
  useFrame(() => live && line.material.color.set(live()))
  return <primitive object={line} />
}
const TRACK = [[WAIT_X, 0], [END_X, 0]]
const GATES = [-1, 1].map((d) => [[-16, d * GATE_U], [16, d * GATE_U]]) // a little wider than the deck so they show past the labels

// 1886-1893: each pier's cofferdam ring, pier footprint and timber staging (with its jetty) in
// plan, outlined from the start and filled as the build goes on; drawn through anything above.
const COFFER = pierShape().getSpacedPoints(90).map((p) => [p.x * 1.18, p.y * 1.25])
const PIER = pierShape().getPoints().map((p) => [p.x, p.y])
const rect = (x, z, hx, hz) => [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz], [x - hx, z - hz]]
const STAGING = [rect(0, 0, 36, 22), rect(18, -37, 2, 15)] // construction.jsx PierWorks, about the pier centre
function Works({ st }) {
  const g = useMemo(() => {
    const loop = (pts, c) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0, z))), c)
      l.renderOrder = 6
      return l
    }
    const fill = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2)
    const lines = () => [loop([...COFFER, COFFER[0]], WORK_LINE), loop([...PIER, PIER[0]], PIER_LINE), ...STAGING.map((r) => loop(r, WORK_LINE))]
    return { coffer: fill(COFFER), pier: fill(PIER), lines: [lines(), lines()] }
  }, [])
  const done = buildDone(st)
  return [1, -1].map((s) => (
    <group key={s} position={[0, WATER + 0.3, s * L.pierZ]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
      <mesh geometry={g.coffer} material={WORK_FILL} material-opacity={0.06 + 0.2 * done} renderOrder={5} />
      <mesh geometry={g.pier} material={PIER_FILL} material-opacity={0.1 + 0.45 * done} renderOrder={5} />
      {g.lines[s > 0 ? 0 : 1].map((l, i) => <primitive key={i} object={l} />)}
    </group>
  ))
}
function Caption({ st, year }) {
  return (
    <Html position={[0, WATER, L.pierZ - 52]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <div style={{ ...TAG, font: '500 13px/1.2 system-ui, sans-serif', padding: '4px 10px' }}>
        <span style={{ opacity: 0.7 }}>{year} · stage {st.stage + 1} of 5 · </span>
        {st.label} · {Math.round(buildDone(st) * 100)}% built
      </div>
    </Html>
  )
}

export function TopView({ st, year, maxAngle, sim }) {
  const stage = st.stage
  const view = useStore((s) => s.view)
  const select = useStore((s) => s.select)
  if (view !== 'top') return null
  return (
    <>
      <Callouts stage={stage} select={select} />
      <MapMarks />
      {shown('bascule', stage) && <SwingGhosts maxAngle={maxAngle} />}
      {shown('bascule', stage) && <LeafAngles sim={sim} />}
      {stage >= 0 && stage < 5 && (
        <>
          <Works st={st} />
          <Caption st={st} year={year} />
        </>
      )}
      {shown('engine', stage) && <Mains sim={sim} />}
      {stage >= 5 && (
        <>
          <Dashed pts={TRACK} color="#f3efe6" dash={6} />
          {GATES.map((g, i) => (
            <Dashed key={i} pts={g} color="#ff1e10" dash={1.2} y={0.6} over live={() => (gatesClosed(sim, useStore.getState().bascule) ? '#ff1e10' : '#30d158')} />
          ))}
        </>
      )}
    </>
  )
}

const INK = new THREE.MeshBasicMaterial({ color: '#15191f', side: THREE.DoubleSide })
const PAPER = new THREE.MeshBasicMaterial({ color: '#f3efe6' })
const GHOST = new THREE.MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })
const OVER = { transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }
const WORK_FILL = new THREE.MeshBasicMaterial({ color: '#c8a26a', ...OVER })
const PIER_FILL = new THREE.MeshBasicMaterial({ color: '#d9d2c3', ...OVER })
const WORK_LINE = new THREE.LineBasicMaterial({ color: '#e0b878', ...OVER })
const PIER_LINE = new THREE.LineBasicMaterial({ color: '#f3efe6', ...OVER })
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
