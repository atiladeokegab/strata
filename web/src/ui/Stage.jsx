// The full-screen 3D world: sky, light, camera views and the scene slots. Clicking a mesh selects the part it belongs to.
import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Raycaster, Vector3 } from 'three'
import { Sky } from '@react-three/drei'
import { useStore, TILES } from '../store'
import { CameraRig } from './CameraRig'
import { makeSlot } from './slots'
import { BridgeStandIn, GroundStandIn, WaterStandIn } from './StandIns'

export const WORLD_TURN = (20.95 * Math.PI) / 180 // meta.json bridge_axis_deg
const Terrain = makeSlot('Terrain', ['../scene/Terrain.jsx'], GroundStandIn)
const Water = makeSlot('Water', ['../scene/Water.jsx'], WaterStandIn)
const TowerBridge = makeSlot('TowerBridge', ['../scene/bridge/TowerBridge.jsx', '../scene/bridge/index.jsx'], BridgeStandIn)
const Look = makeSlot('Look', ['../scene/Look.jsx'], DefaultLook)
const Tour = makeSlot('Tour', ['../scene/Tour.jsx'])
const GoogleTiles = makeSlot('GoogleTiles', ['../scene/GoogleTiles.jsx'])
const Buildings = makeSlot('Buildings', ['../scene/Buildings.jsx'])
const Landmarks = makeSlot('Landmarks', ['../scene/Landmarks.jsx'])
const SUN = [-320, 260, 420] // late-afternoon light from the south-west

function partOf(object, ids) {
  for (let o = object; o; o = o.parent) if (ids.has(o.name)) return o.name
  return null
}

// Scene labels (drei <Html> buttons in .stage) hide while they overlap the on-screen controls,
// or, with the bascules up, while their anchor is behind or inside a raised leaf.
const CLEAR_OF = '.controls, .credit, .dock, .embed-open'
const overlaps = (a, b, m = 6) => a.left < b.right + m && a.right > b.left - m && a.top < b.bottom + m && a.bottom > b.top - m
const LEAF = /^bascule-(north|south)$/
const ray = new Raycaster()
const at = new Vector3()

// screen points (px) of label anchors a raised leaf hides: one ray per landmark, tested against the leaf meshes only
// The leaves are driven by the dock slider, the tour and the ship lift sequence, so no "raised" flag
// is shared; test always (a closed deck that hides an anchor hides it too). The mesh list is cached 2 s.
let leafCache = { at: 0, list: [] }
export function behindLeaves(scene, camera, canvas) {
  const now = performance.now()
  if (now - leafCache.at > 2000) {
    const list = []
    scene.traverseVisible((o) => { if (o.isMesh && LEAF.test(o.name)) list.push(o) })
    leafCache = { at: now, list }
  }
  const leaves = leafCache.list
  const marks = scene.getObjectByName('landmarks')
  if (!leaves.length || !marks) return []
  const box = canvas.getBoundingClientRect()
  const hidden = []
  for (const g of marks.children) {
    const anchor = g.children[0] // drei <Html>'s own group, at the label's anchor
    if (!anchor) continue
    anchor.getWorldPosition(at)
    ray.set(camera.position, at.clone().sub(camera.position).normalize())
    ray.far = camera.position.distanceTo(at)
    if (!ray.intersectObjects(leaves, false).length) continue
    at.project(camera)
    hidden.push([box.left + ((at.x + 1) / 2) * box.width, box.top + ((1 - at.y) / 2) * box.height])
  }
  return hidden
}

function LabelGuard() {
  const { scene, camera, gl } = useThree()
  useEffect(() => {
    const id = setInterval(() => {
      const keep = [...document.querySelectorAll(CLEAR_OF)].map((el) => el.getBoundingClientRect())
      const hidden = behindLeaves(scene, camera, gl.domElement)
      for (const b of document.querySelectorAll('.stage button')) {
        const r = b.getBoundingClientRect()
        const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2 // labels are centred on their anchor
        const off = keep.some((k) => overlaps(r, k)) || hidden.some(([x, y]) => Math.abs(x - cx) < 4 && Math.abs(y - cy) < 4)
        b.style.visibility = off ? 'hidden' : ''
      }
    }, 150)
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
      onPointerMissed={(e) => e.type === 'click' && select(null)}
    >
      <Look />
      <Tour />
      <CameraRig />
      <LabelGuard />
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
      <color attach="background" args={['#c9d3d8']} />
      <fog attach="fog" args={['#c9d3d8', 900, 3200]} />
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
