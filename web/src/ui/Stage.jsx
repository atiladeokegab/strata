// The full-screen 3D world: sky, light, camera views and the scene slots. Clicking a mesh selects the part it belongs to.
import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Raycaster, Vector3 } from 'three'
import { Sky } from '@react-three/drei'
import { useStore, TILES, EMBED } from '../store'
import { CameraRig } from './CameraRig'
import { makeSlot } from './slots'
import { ReadyProbe } from './SceneLoading'
import { BridgeStandIn, GroundStandIn, WaterStandIn } from './StandIns'

export const WORLD_TURN = (20.95 * Math.PI) / 180 // meta.json bridge_axis_deg
const Terrain = makeSlot('Terrain', ['../scene/Terrain.jsx'], GroundStandIn)
const Water = makeSlot('Water', ['../scene/Water.jsx'], WaterStandIn)
const TowerBridge = makeSlot('TowerBridge', ['../scene/bridge/TowerBridge.jsx', '../scene/bridge/index.jsx'], BridgeStandIn)
const Look = makeSlot('Look', ['../scene/Look.jsx'], DefaultLook, true)
const Tour = makeSlot('Tour', ['../scene/Tour.jsx'])
const GoogleTiles = makeSlot('GoogleTiles', ['../scene/GoogleTiles.jsx'])
const Buildings = makeSlot('Buildings', ['../scene/Buildings.jsx'])
const Landmarks = makeSlot('Landmarks', ['../scene/Landmarks.jsx'])
const SKY = '#c9d3d8' // index.css --sky
const SUN = [-320, 260, 420] // late-afternoon light from the south-west

function partOf(object, ids) {
  for (let o = object; o; o = o.parent) if (ids.has(o.name)) return o.name
  return null
}

// Scene labels (drei <Html> buttons in .stage) are kept readable: nearest first, each one hides while it overlaps
// the on-screen controls or a nearer label, or while its anchor is behind or inside a raised leaf; a label cut
// by the screen edge is slid back inside it. Embeds keep only the few nearest.
const CLEAR_OF = '.controls, .credit, .dock, .embed-open'
const overlaps = (a, b, m = 6) => a.left < b.right + m && a.right > b.left - m && a.top < b.bottom + m && a.bottom > b.top - m
const LEAF = /^bascule-(north|south)$/
const EDGE = 8 // px kept clear of the screen edge
const EMBED_LABELS = 4
const ray = new Raycaster()
const at = new Vector3()

// every label anchor on screen: {x, y} in px, its distance d from the camera, and whether a leaf hides it.
// The leaves are driven by the dock slider, the tour and the ship lift sequence, so no "raised" flag
// is shared; test always (a closed deck that hides an anchor hides it too). The leaf mesh list is cached 2 s.
let leafCache = { at: 0, list: [] }
export function labelAnchors(scene, camera, canvas) {
  const now = performance.now()
  if (now - leafCache.at > 2000) {
    const list = []
    scene.traverseVisible((o) => { if (o.isMesh && LEAF.test(o.name)) list.push(o) })
    leafCache = { at: now, list }
  }
  const leaves = leafCache.list
  const marks = scene.getObjectByName('landmarks')
  if (!marks) return []
  const box = canvas.getBoundingClientRect()
  const out = []
  for (const g of marks.children) {
    const anchor = g.children[0] // drei <Html>'s own group, at the label's anchor
    if (!anchor) continue
    anchor.getWorldPosition(at)
    const d = camera.position.distanceTo(at)
    ray.set(camera.position, at.clone().sub(camera.position).normalize())
    ray.far = d
    const hidden = leaves.length > 0 && ray.intersectObjects(leaves, false).length > 0
    at.project(camera)
    out.push({ x: box.left + ((at.x + 1) / 2) * box.width, y: box.top + ((1 - at.y) / 2) * box.height, d, hidden })
  }
  return out
}

// one pass over the labels; returns the names shown. ?capture=1 exposes it as window.__strataLabels for the label test
export function guardLabels(scene, camera, canvas, max = Infinity) {
  const keep = [...document.querySelectorAll(CLEAR_OF)].map((el) => el.getBoundingClientRect())
  const anchors = labelAnchors(scene, camera, canvas)
  const W = innerWidth, H = innerHeight
  const labels = [...document.querySelectorAll('.stage button')].map((b) => {
    const r = b.getBoundingClientRect(), was = +(b.dataset.dx || 0)
    const left = r.left - was, right = r.right - was
    const cx = (left + right) / 2, cy = (r.top + r.bottom) / 2 // labels are centred on their anchor
    const a = anchors.find((p) => Math.abs(p.x - cx) < 4 && Math.abs(p.y - cy) < 4)
    const dx = Math.max(EDGE - left, Math.min(0, W - EDGE - right)) // slide a label cut by the edge back on screen
    return { b, dx, a, cx, cy, r: { left: left + dx, right: right + dx, top: r.top, bottom: r.bottom } }
  }).filter((l) => l.a) // landmark labels only: the leaf lever's screen-reader button and "Lift for a ship" stay as they are
    .sort((p, q) => p.a.d - q.a.d) // nearest first
  const shown = []
  for (const l of labels) {
    const off = l.cx < 0 || l.cx > W || l.cy < EDGE || l.cy > H - EDGE // anchor off screen: no clamping to a wrong place
      || l.a.hidden || shown.length >= max
      || keep.some((k) => overlaps(l.r, k)) || shown.some((s) => overlaps(l.r, s.r, 4))
    if (!off) shown.push(l)
    l.b.style.visibility = off ? 'hidden' : ''
    l.b.dataset.dx = l.dx
    l.b.style.transform = l.dx ? `translateX(${l.dx}px)` : ''
  }
  return shown.map((l) => l.b.textContent)
}

function LabelGuard() {
  const { scene, camera, gl } = useThree()
  useEffect(() => {
    const run = () => guardLabels(scene, camera, gl.domElement, EMBED ? EMBED_LABELS : Infinity)
    const id = setInterval(run, 150)
    if (new URLSearchParams(location.search).has('capture')) window.__strataLabels = run
    return () => clearInterval(id)
  }, [scene, camera, gl])
  return null
}

export function Stage() {
  const place = useStore((s) => s.place)
  const select = useStore((s) => s.select)
  const lidar = useStore((s) => s.lidar)
  const ids = new Set(place?.parts.map((p) => p.id))
  const hit = (e) => partOf(e.object, ids)
  return (
    <Canvas
      className="stage"
      shadows
      dpr={[1, 2]}
      camera={{ position: [170, 75, 190], fov: 45, near: 0.3, far: 6000 }}
      onCreated={({ gl }) => gl.setClearColor(SKY)} // before Look paints its sky
      onPointerMissed={(e) => e.type === 'click' && select(null)}
    >
      <Look />
      <Tour />
      <CameraRig />
      <LabelGuard />
      <ReadyProbe />
      {TILES && <GoogleTiles />}{/* outside the click group: Google meshes and OSM buildings are never parts */}
      <Buildings />
      <group
        name="world"
        onClick={(e) => { const id = hit(e); if (id) { e.stopPropagation(); select(id) } }}
        onPointerOver={(e) => { if (hit(e)) { e.stopPropagation(); document.body.style.cursor = 'pointer' } }}
        onPointerOut={() => { document.body.style.cursor = '' }}
      >
        {/* Real world layers are grid-aligned (x east, z south); the bridge model runs along z, the real one 20.95° east of grid north, so turn the world to meet it. */}
        <group rotation-y={WORLD_TURN}>
          <Terrain lidar={lidar} />
          <Water />
          <Landmarks />{/* grid-aligned like the terrain; its pins select their place */}
        </group>
        <TowerBridge />
      </group>
    </Canvas>
  )
}

// sky and light until build-look's Look.jsx lands, and if it ever fails
function DefaultLook() {
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 900, 3200]} />
      <Sky distance={4500} sunPosition={SUN} turbidity={7} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.85} />
      <hemisphereLight args={['#dfe8ef', '#4b4536', 0.75]} />
      <directionalLight
        position={SUN}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
        shadow-camera-far={1500}
        shadow-bias={-0.0004}
      />
    </>
  )
}
