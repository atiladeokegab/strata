import { Suspense, lazy, useEffect, useState } from 'react'
import { useStore } from './store'
import { Stage } from './ui/Stage'
import { Panel } from './ui/Panel'
import { Controls, Dock } from './ui/Dock'
// photo tools load after first paint
const Reimagine = lazy(() => import('./ui/Reimagine'))
const Identify = lazy(() => import('./ui/Identify'))
import Home from './ui/home/Home'
import { Guard, makeSlot } from './ui/slots'
import { Help, HelpButton, helpSeen } from './ui/Help'
import './App.css'

const PLACE = 'tower-bridge'
const GoogleCredit = makeSlot('GoogleCredit', ['../scene/GoogleTiles.jsx']) // Google's copyright must show while its tiles do
const BuildingsCredit = makeSlot('BuildingsCredit', ['../scene/Buildings.jsx']) // OSM ODbL credit while buildings show

function Credit() {
  const lidar = useStore((s) => s.lidar)
  const old = useStore((s) => s.year < 1950) // Terrain drapes the NLS 1890s map then
  const [meta, setMeta] = useState(null)
  useEffect(() => {
    fetch(`/terrain/${PLACE}/meta.json`).then((r) => (r.ok ? r.json() : null)).then(setMeta).catch(() => {})
  }, [])
  return (
    <p className="credit">
      <span className={`lidar-tag${lidar ? ' on' : ''}`}>LiDAR</span>
      {meta ? (meta.attribution ?? `${meta.source}${meta.licence ? ` · ${meta.licence}` : ''}`) : 'Environment Agency 1 m LiDAR, terrain loading'}
      {old && <> · 1890s map: OS London 1893-96, <a href="https://maps.nls.uk/" target="_blank" rel="noreferrer">reproduced with the permission of the National Library of Scotland</a> (CC-BY)</>}
      <GoogleCredit />
      <BuildingsCredit />
    </p>
  )
}

// phones: hold an arrow to walk; it presses the same keys WalkControls listens for
const PAD = [['KeyW', '↑', 'Walk forward'], ['KeyA', '←', 'Step left'], ['KeyS', '↓', 'Walk back'], ['KeyD', '→', 'Step right']]
function MovePad() {
  const key = (type, code) => () => window.dispatchEvent(new KeyboardEvent(type, { code }))
  return (
    <div className="move-pad" aria-label="Walk controls">
      {PAD.map(([code, glyph, label]) => (
        <button key={code} type="button" className={`glass ${code}`} aria-label={label}
          onPointerDown={key('keydown', code)} onPointerUp={key('keyup', code)} onPointerLeave={key('keyup', code)} onPointerCancel={key('keyup', code)}
          onContextMenu={(e) => e.preventDefault()}>{glyph}</button>
      ))}
    </div>
  )
}

function AutoEnter({ go }) {
  useEffect(() => { go() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
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
  // the museum landing first; ?tour=1 (film takes) goes straight in. Only one canvas lives at a time, so Reimagine captures the bridge.
  const [entered, setEntered] = useState(() => new URLSearchParams(location.search).get('tour') === '1')
  const load = () => { setError(false); loadPlace(PLACE).catch(() => setError(true)) }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps
  const sheet = useStore((s) => s.sheet)
  const enter = () => {
    setEntered(true)
    const film = /[?&](tour|capture)=1/.test(location.search)
    if (!film && !helpSeen()) useStore.getState().setHelp(true)
  }
  // no WebGL (old phone, locked-down browser): skip the 3D landing; the panel, timeline and docent still work
  if (!entered) return <Guard name="Home" fallback={<AutoEnter go={enter} />}><Home onEnter={enter} /></Guard>
  return (
    <div className={`app view-${view}${sheet ? ' sheet-open' : ''}`}>
      <Guard name="Stage" fallback={<p className="no-webgl">This browser can't draw the 3D bridge. The facts, timeline and docent below still work.</p>}><Stage /></Guard>
      <Panel />
      <Dock />
      <Controls>
        <Suspense fallback={null}>
          <Reimagine />
          <Identify />
        </Suspense>
        <HelpButton />
      </Controls>
      <Help />
      <Credit />
      {view === 'walk' && <p className="walk-hint glass">W A S D to walk · drag to look · Shift to run</p>}
      {view === 'walk' && <MovePad />}
      {(!place || error) && <Loading error={error} retry={load} />}
    </div>
  )
}
