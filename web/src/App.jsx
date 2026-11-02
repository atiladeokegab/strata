import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useStore, EMBED } from './store'
const Stage = lazy(() => import('./ui/Stage').then((m) => ({ default: m.Stage }))) // three.js and the scene stay out of Home's entry chunk
import { Panel } from './ui/Panel'
import { Controls, Dock } from './ui/Dock'
// photo tools load after first paint
const Reimagine = lazy(() => import('./ui/Reimagine'))
const Identify = lazy(() => import('./ui/Identify'))
import Home from './ui/home/Home'
import { Guard, makeSlot } from './ui/slots'
import { Help, HelpButton, StoryButton, helpSeen } from './ui/Help'
import { SceneLoading } from './ui/SceneLoading'
import './App.css'

const PLACE = 'tower-bridge'
// Map Tiles terms: Google's attribution shows in full whenever its tiles do (never ellipsised); hidden before GOOGLE_FROM (2012) with the tiles
const google = Object.values(import.meta.glob('./scene/google/state.js', { eager: true }))[0]
const GoogleCredit = google ? function GoogleCredit({ lidar }) {
  const shown = google.useGoogleShown(lidar)
  const credit = google.useGoogle((s) => s.credit)
  if (!shown) return null
  // policy wording: name "Google Maps", say which part is Google's, then the providers as given (sorted by frequency, joined by ;)
  return <span className="google-credit"><b>3D city: Google Maps</b>{credit && credit !== 'Google' ? ` · ${credit}` : ''}</span>
} : () => null
const BuildingsCredit = makeSlot('BuildingsCredit', ['../scene/Buildings.jsx']) // OSM ODbL credit while buildings show
const Guide = makeSlot('Guide', ['../tour/Guide.jsx']) // build-tour's guided tour; inside .app for --sheet

function Credit() {
  const lidar = useStore((s) => s.lidar)
  const old = useStore((s) => s.year < 1950) // Terrain drapes the NLS 1890s map then
  const [meta, setMeta] = useState(null)
  const [open, setOpen] = useState(false)
  const pill = useRef(null)
  useEffect(() => { // phones stack the controls under the pill, whose height follows Google's credit
    const ro = new ResizeObserver(([e]) => document.documentElement.style.setProperty('--credit-h', `${Math.round(e.target.getBoundingClientRect().height)}px`))
    ro.observe(pill.current)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    fetch(`/terrain/${PLACE}/meta.json`).then((r) => (r.ok ? r.json() : null)).then(setMeta).catch(() => {})
  }, [])
  return (
    <p ref={pill} className={`credit${open ? ' open' : ''}`}>
      <span className={`lidar-tag${lidar ? ' on' : ''}`}>LiDAR</span>
      <span className="credit-full">
      {meta ? (meta.attribution ?? `${meta.source}${meta.licence ? ` · ${meta.licence}` : ''}`) : 'Environment Agency 1 m LiDAR, terrain loading'}
      {old && <> · 1890s map: OS London 1893-96, <a href="https://maps.nls.uk/" target="_blank" rel="noreferrer">reproduced with the permission of the National Library of Scotland</a> (CC-BY)</>}
      <BuildingsCredit />
      </span>
      <GoogleCredit lidar={lidar} />
      <button type="button" className="credit-more" aria-expanded={open} onClick={() => setOpen(!open)}>Sources <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 7v4.2M8 4.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
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

const FILM = 'https://drive.google.com/file/d/1uNi3PW-jJgSrKpRLj1RA3SoMRMLxtWnQ/view?usp=sharing'
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false } }

// three throws "Error creating WebGL context" outside React, so watch for it as well as checking up front
function useNoWebGL() {
  const [none, setNone] = useState(() => !hasWebGL())
  useEffect(() => {
    const hit = (m) => /WebGL context/i.test(String(m)) && setNone(true)
    const onError = (e) => hit(e.message || e.error?.message)
    const onReject = (e) => hit(e.reason?.message || e.reason)
    addEventListener('error', onError); addEventListener('unhandledrejection', onReject)
    return () => { removeEventListener('error', onError); removeEventListener('unhandledrejection', onReject) }
  }, [])
  return none
}

function NoWebGL() {
  return (
    <div className="no-webgl glass" role="alert">
      <p>{"Your browser couldn't start 3D. Try Chrome, or watch the film:"}</p>
      <a className="primary" href={FILM} target="_blank" rel="noreferrer">Watch the film</a>
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
  // the museum landing first; ?tour=1, ?capture=1 and ?film=1 (shot scripts) go straight into the full scene. Only one canvas lives at a time, so Reimagine captures the bridge.
  const [entered, setEntered] = useState(() => /[?&](tour|capture|film)=1/.test(location.search))
  const load = () => { setError(false); loadPlace(PLACE).catch(() => setError(true)) }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps
  const sheet = useStore((s) => s.sheet)
  const noGL = useNoWebGL()
  const enter = () => {
    setEntered(true)
    const film = /[?&](tour|capture)=1/.test(location.search)
    if (!film && !helpSeen()) useStore.getState().setHelp(true)
  }
  if (EMBED) {
    const full = new URL(location.href)
    full.searchParams.delete('embed')
    full.pathname = full.pathname.replace(/\/{2,}/g, '/') // a parent's src with a trailing slash gave …run.app//?capture=1
    return (
      <div className="app embed">
        {noGL ? <NoWebGL /> : <Guard name="Stage" fallback={<NoWebGL />}><Suspense fallback={null}><Stage /></Suspense></Guard>}
        {!noGL && !error && <SceneLoading />}
        <a className="embed-open glass" href={full.toString()} target="_blank" rel="noreferrer">Open the full app <span aria-hidden="true">↗</span></a>
        <Credit />
        {error && <Loading error retry={load} />}
      </div>
    )
  }
  // no WebGL (old phone, locked-down browser): skip the 3D landing; the panel, timeline and docent still work
  if (!entered && !noGL) return <Guard name="Home" fallback={<AutoEnter go={enter} />}><Home onEnter={enter} /></Guard>
  return (
    <div className={`app view-${view}${sheet ? ' sheet-open' : ''}`}>
      {noGL ? <NoWebGL /> : <Guard name="Stage" fallback={<NoWebGL />}><Suspense fallback={null}><Stage /></Suspense></Guard>}
      {!noGL && !error && <SceneLoading />}{/* before the panel and controls, so they paint over it and stay usable */}
      <Panel />
      <Dock />
      <Controls>
        <Suspense fallback={null}>
          <Reimagine />
          <Identify />
        </Suspense>
        <div className="ctl-row"><StoryButton /><HelpButton /></div>
      </Controls>
      <Help />
      <Guide />
      <Credit />
      {view === 'walk' && <p className="walk-hint glass">W A S D to walk · drag to look · Shift to run</p>}
      {view === 'walk' && <MovePad />}
      {(noGL ? !place || error : error) && <Loading error={error} retry={load} />}
    </div>
  )
}
