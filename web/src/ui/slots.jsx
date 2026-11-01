// Scene slots owned by other builders. A file that is not there yet, or one that throws, shows a stand-in instead of breaking the canvas.
import { Component, Suspense, lazy } from 'react'

// globs of files that do not exist yet are simply empty, so the build never fails on a missing slot
const mods = import.meta.glob(['../scene/Terrain.jsx', '../scene/Water.jsx', '../scene/bridge/TowerBridge.jsx', '../scene/bridge/index.jsx', '../scene/Look.jsx', '../scene/Tour.jsx', '../scene/GoogleTiles.jsx', '../scene/Buildings.jsx', '../scene/Landmarks.jsx'])

class Guard extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e) { console.warn(`[strata] ${this.props.name} failed, showing the stand-in:`, e) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function makeSlot(name, paths, Fallback = () => null) {
  const key = paths.find((p) => mods[p])
  const Real = key && lazy(() => mods[key]().then((m) => ({ default: m[name] || m.default })))
  function Slot(props) {
    if (!Real) return <Fallback {...props} />
    return (
      <Guard name={name} fallback={<Fallback {...props} />}>
        <Suspense fallback={null}><Real {...props} /></Suspense>
      </Guard>
    )
  }
  Slot.isStandIn = !Real
  return Slot
}
