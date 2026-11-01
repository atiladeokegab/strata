// Plain stand-ins until the real terrain, water and bridge land. Meshes carry part ids, so selection and the sliders work now.
import { useStore } from '../store'

export function GroundStandIn() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-9} receiveShadow>
      <planeGeometry args={[3000, 3000]} />
      <meshStandardMaterial color="#5d5a4f" roughness={1} />
    </mesh>
  )
}

export function WaterStandIn() {
  // the Thames runs roughly east-west here, under a north-south bridge
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-8.6} receiveShadow>
      <planeGeometry args={[3000, 250]} />
      <meshStandardMaterial color="#29404a" roughness={0.25} metalness={0.2} />
    </mesh>
  )
}

const stone = <meshStandardMaterial color="#b9b2a2" roughness={0.85} />
const steel = <meshStandardMaterial color="#5f7f92" roughness={0.5} metalness={0.4} />

export function BridgeStandIn() {
  const bascule = useStore((s) => s.bascule)
  const exploded = useStore((s) => s.exploded)
  const angle = (bascule * 86 * Math.PI) / 180
  const out = exploded ? 22 : 0
  return (
    <group>
      {[['north-tower', -1], ['south-tower', 1]].map(([id, s]) => (
        <mesh key={id} name={id} position={[0, 25, s * (40.5 + out)]} castShadow receiveShadow>
          <boxGeometry args={[18, 60, 20]} />{stone}
        </mesh>
      ))}
      {/* each leaf pivots at its tower's inner face and meets the other at the centre */}
      <group position={[0, exploded ? 8 : 0, -30.5 - out]} rotation-x={-angle}>
        <mesh name="bascule-north" position={[0, -0.6, 15.25]} castShadow><boxGeometry args={[14, 1.2, 30.5]} />{steel}</mesh>
      </group>
      <group position={[0, exploded ? 8 : 0, 30.5 + out]} rotation-x={angle}>
        <mesh name="bascule-south" position={[0, -0.6, -15.25]} castShadow><boxGeometry args={[14, 1.2, 30.5]} />{steel}</mesh>
      </group>
    </group>
  )
}
