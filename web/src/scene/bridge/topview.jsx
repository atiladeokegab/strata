// <TopView />: what the sky view adds. Clickable part callouts with leader lines (placed by the
// pure placeLabels so they never overlap, hidden when the camera is far), a 50 m scale bar, a
// north arrow, and a faint swing envelope for each bascule drawn flat on the water.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../../store.js'
import { shown } from './stages.js'
import { L } from './structures.jsx'
import { CALLOUTS, labelSize, placeLabels } from './callouts.js'
import { box, merge } from './geom.js'

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

// Each leaf sweeps up to maxAngle about its pivot; drawn rabatted onto the water like a door swing.
function SwingGhosts({ maxAngle }) {
  const geo = useMemo(() => {
    const r = -L.pivotZ
    const sector = (sign) =>
      new THREE.RingGeometry(r - 0.6, r, 48, 1, 0, maxAngle)
        .rotateX(-Math.PI / 2)
        .rotateY(sign > 0 ? -Math.PI / 2 : Math.PI / 2)
        .translate(0, WATER, sign * L.pivotZ)
    const fill = (sign) =>
      new THREE.CircleGeometry(r, 48, 0, maxAngle)
        .rotateX(-Math.PI / 2)
        .rotateY(sign > 0 ? -Math.PI / 2 : Math.PI / 2)
        .translate(0, WATER - 0.05, sign * L.pivotZ)
    return { edge: merge([sector(1), sector(-1)]), fill: merge([fill(1), fill(-1)]) }
  }, [maxAngle])
  return (
    <>
      <mesh geometry={geo.fill} material={GHOST} renderOrder={1} />
      <mesh geometry={geo.edge} material={GHOST_EDGE} renderOrder={1} />
    </>
  )
}

export function TopView({ stage, maxAngle }) {
  const view = useStore((s) => s.view)
  const select = useStore((s) => s.select)
  if (view !== 'top') return null
  return (
    <>
      <Callouts stage={stage} select={select} />
      <MapMarks />
      {shown('bascule', stage) && <SwingGhosts maxAngle={maxAngle} />}
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
