// LITE: the pier and cabin interiors (hydraulic engines, accumulators, cabin controls) are only drawn
// when they could be seen: exploded, selected, or their shell x-rayed by the selection. (Stairs and
// lifts gate on `inside` in TowerBridge.)
import { useStore } from '../../store.js'
import { LITE } from '../look/tier.js'
import { containersOf } from './xray.js'

export const interiorShown = (id, s) => !LITE || s.exploded || s.selected === id || containersOf(s.selected).some((c) => containersOf(id).includes(c))

export function Interior({ id, children }) {
  return <group visible={useStore((s) => interiorShown(id, s))}>{children}</group>
}
