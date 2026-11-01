// The full-screen 3D world: sky, light, camera views and the scene slots. Clicking a mesh selects the part it belongs to.
import { Canvas } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import { useStore } from '../store'
import { CameraRig } from './CameraRig'
import { makeSlot } from './slots'
import { BridgeStandIn, GroundStandIn, WaterStandIn } from './StandIns'

const Terrain = makeSlot('Terrain', ['../scene/Terrain.jsx'], GroundStandIn)
const Water = makeSlot('Water', ['../scene/Water.jsx'], WaterStandIn)
const TowerBridge = makeSlot('TowerBridge', ['../scene/bridge/TowerBridge.jsx', '../scene/bridge/index.jsx'], BridgeStandIn)
const Look = makeSlot('Look', ['../scene/Look.jsx'], DefaultLook)
const Tour = makeSlot('Tour', ['../scene/Tour.jsx'])
const SUN = [-320, 260, 420] // late-afternoon light from the south-west

function partOf(object, ids) {
  for (let o = object; o; o = o.parent) if (ids.has(o.name)) return o.name
  return null
}

export function Stage() {
  const place = useStore((s) => s.place)
  const select = useStore((s) => s.select)
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
      <group
        onClick={(e) => { const id = hit(e); if (id) { e.stopPropagation(); select(id) } }}
        onPointerOver={(e) => { if (hit(e)) { e.stopPropagation(); document.body.style.cursor = 'pointer' } }}
        onPointerOut={() => { document.body.style.cursor = '' }}
      >
        <Terrain />
        <Water />
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
