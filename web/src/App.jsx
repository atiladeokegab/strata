import { useEffect, useState } from 'react'
import { useStore } from './store'
import { Stage } from './ui/Stage'
import { Panel } from './ui/Panel'
import { Dock } from './ui/Dock'
import './App.css'

const PLACE = 'tower-bridge'

function Credit() {
  const lidar = useStore((s) => s.lidar)
  const [meta, setMeta] = useState(null)
  useEffect(() => {
    fetch(`/terrain/${PLACE}/meta.json`).then((r) => (r.ok ? r.json() : null)).then(setMeta).catch(() => {})
  }, [])
  return (
    <p className="credit">
      <span className={`lidar-tag${lidar ? ' on' : ''}`}>LiDAR</span>
      {meta ? `${meta.source}${meta.licence ? ` · ${meta.licence}` : ''}` : 'Environment Agency 1 m LiDAR, terrain loading'}
    </p>
  )
}

function Loading({ error, retry }) {
  return (
    <div className={`loading${error ? ' failed' : ''}`} role="status">
      <span className="mark" aria-hidden="true" />
      <p className="word">Strata</p>
      {error ? (<><p>The place could not be loaded.</p><button type="button" onClick={retry}>Try again</button></>) : <p>Rebuilding Tower Bridge…</p>}
    </div>
  )
}

export default function App() {
  const place = useStore((s) => s.place)
  const view = useStore((s) => s.view)
  const loadPlace = useStore((s) => s.loadPlace)
  const [error, setError] = useState(false)
  const load = () => { setError(false); loadPlace(PLACE).catch(() => setError(true)) }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`app view-${view}`}>
      <Stage />
      <Panel />
      <Dock />
      <Credit />
      {view === 'walk' && <p className="walk-hint glass">W A S D to walk · drag to look · Shift to run</p>}
      {(!place || error) && <Loading error={error} retry={load} />}
    </div>
  )
}
