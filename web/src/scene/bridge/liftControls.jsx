// Lift UI in the scene: the current lift caption as a pill over the towers, and, when the river
// holds a vessel too tall for the closed deck, a "Lift for a ship" button by the north tower.
// Both hide in top view. `lift` is plain state, so poll its phase and re-render on change.
import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useStore } from '../../store.js'
import { lift, liftForShip } from './liftSequence.js'
import { vesselForYear, needsLift } from './vessels.js'
import { L } from './structures.jsx'

export function LiftControls({ year, towerTop, style }) {
  const view = useStore((s) => s.view)
  const [phase, setPhase] = useState(lift.phase)
  useFrame(() => lift.phase !== phase && setPhase(lift.phase))
  if (view === 'top') return null
  if (phase !== 'idle')
    return (
      <Html position={[0, towerTop + 14, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="bridge-lift-caption" style={style}>
          {lift.caption}
        </div>
      </Html>
    )
  if (!needsLift(vesselForYear(year))) return null
  return (
    <Html position={[L.towerHalfX + 4, 12, L.pierZ]} center zIndexRange={[10, 0]}>
      <button type="button" className="bridge-lift-button" style={{ ...style, cursor: 'pointer' }} onClick={() => liftForShip()}>
        Lift for a ship
      </button>
    </Html>
  )
}
