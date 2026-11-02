// <Tour />: mount inside the R3F <Canvas>. Plays the guided story while useTour.playing; any key, drag or wheel stops it.
// ?tour=1 in the URL starts it once the place has loaded (for recording the film).
// The part close-up and the controls hand-off are adapted from Mechanica (MIT), src/ui/viewer/DemoFocusRig.tsx.
import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Box3, Sphere, Vector3 } from 'three'
import { useStore, THIS_YEAR } from '../store.js'
import { framed } from '../ui/CameraRig.jsx'
import { bridgeHydraulics } from './bridge/TowerBridge.jsx'
import { useTour, startTour, stopTour, DURATION, poseAt, runTracks, hydraulicsPart, CARD, cardOpacity, BEATS, DOCENT_Q, HANDOFF } from '../tour/tour.js'

export default function Tour() {
  const playing = useTour((s) => s.playing)
  const { camera, scene, gl } = useThree()
  const controls = useThree((st) => st.controls)
  const run = useRef(null) // {prev, ctx, centres}
  const card = useRef(null)
  const angle = useRef(null) // the opening beat's live leaf angle, written each frame (no re-render)
  const app = useRef(document.querySelector('.app'))
  const [beat, setBeat] = useState(-1) // index into BEATS, 'handoff', or -1
  const [answer, setAnswer] = useState(null) // the docent's live reply {text, citations, refused}
  const [linger, setLinger] = useState(false) // the hand-back card stays a few seconds after the end

  // ?tour=1: start when the place is in (or after 4 s regardless, so a dead API never blocks a take).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tour') !== '1') return
    let go = () => { go = () => {}; startTour() }
    const timer = setTimeout(() => go(), 4000)
    const off = useStore.subscribe((s) => s.place && setTimeout(() => go(), 1200))
    if (useStore.getState().place) setTimeout(() => go(), 1200)
    return () => { clearTimeout(timer); off() }
  }, [])

  useEffect(() => {
    if (!playing) return
    const place = useStore.getState().place
    run.current = { prev: -1, ctx: { hydraulics: hydraulicsPart(place, (id) => !!scene.getObjectByName(id)) }, centres: {} }
    if (camera.far < 6000) { camera.far = 6000; camera.updateProjectionMatrix() } // the opening shot is ~1 km out
    if (controls) controls.enabled = false // as Mechanica's focus rig: the tour drives, the controls wait
    setBeat(-1); setAnswer(null); setLinger(false)
    const ask = new AbortController() // asked now so the answer is in by its beat; no answer, no card text
    fetch('/api/ask', { method: 'POST', signal: ask.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ place: place?.id ?? 'tower-bridge', part: run.current.ctx.hydraulics, question: DOCENT_Q }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => a?.answer && setAnswer({ text: a.answer.replace(/\s*\[[\w-]+\]/g, ''), citations: a.citations ?? [], refused: a.refused }))
      .catch(() => {})
    const el = gl.domElement
    const interrupt = (e) => {
      if (/^(F\d{1,2}|Shift|Control|Alt|Meta|Escape)$/.test(e?.key ?? '')) return // fullscreen, modifiers, Esc: not a request to stop
      stopTour()
      const s = useStore.getState() // leave the place in a sane state, wherever the story was cut
      s.setBascule(0); s.setExploded(false); s.setYear(THIS_YEAR); s.setLidar?.(false)
      if (s.view === 'top') s.setView('orbit')
    }
    window.addEventListener('keydown', interrupt)
    el.addEventListener('pointerdown', interrupt)
    el.addEventListener('wheel', interrupt, { passive: true })
    return () => {
      window.removeEventListener('keydown', interrupt)
      el.removeEventListener('pointerdown', interrupt)
      el.removeEventListener('wheel', interrupt)
      if (controls) controls.enabled = true
      ask.abort()
    }
  }, [playing, camera, gl, scene, controls])

  // Default priority: runs after drei controls (priority -1), so the tour owns the camera while it plays.
  useFrame((state) => {
    const r = run.current
    if (!useTour.getState().playing || !r) return
    if (!useStore.getState().sceneSettled) return void useTour.setState({ startedAt: performance.now() }) // Home's story button: hold at 0 s until the loading card lifts, or the opening card plays behind it
    const t = Math.min(DURATION, (performance.now() - useTour.getState().startedAt) / 1000)
    if (card.current) card.current.style.opacity = Math.max(0, cardOpacity(t))
    if (angle.current) angle.current.textContent = Math.round((bridgeHydraulics.angle * 180) / Math.PI)
    runTracks(r.prev, t, r.ctx)
    r.prev = t
    const { pos, target } = poseAt(t, (k) => (k.part && fitPart(scene, camera, r, r.ctx.hydraulics, k)) || k)
    const f = framed({ to: new Vector3(...pos), toTarget: new Vector3(...target) }, camera, phoneShift())
    camera.position.copy(f.to)
    camera.lookAt(f.toTarget)
    if (state.controls?.target) state.controls.target.copy(f.toTarget) // hand over without a jump
    const b = t >= HANDOFF.from ? 'handoff' : BEATS.findIndex((x) => t >= x.from && t < x.to)
    if (b !== r.beat) { r.beat = b; setBeat(b) }
    if (t >= DURATION) { stopTour(); setLinger(true); setTimeout(() => setLinger(false), 4000) }
  })

  if (!playing && !linger) return null
  const sources = useStore.getState().place?.sources ?? []
  return (<>
    <Html fullscreen portal={app} calculatePosition={pinToScreen} onOcclude={keepShown} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      {BEATS.map((x, i) => (
        <div key={i} className={'story-caption' + (beat === i ? ' on' : '')} aria-hidden={beat !== i}>
          <div className="glass" style={captionBox}>
            <p className="eyebrow">{x.label}</p>
            {x.docent ? (
              <>
                <p style={{ margin: 0, color: 'var(--muted)', fontStyle: 'italic' }}>{DOCENT_Q}</p>
                {answer ? (
                  <>
                    {answer.refused && <span className="chip status refused">No source, so no answer</span>}
                    <p style={{ margin: '8px 0 0', color: 'var(--ink)' }}>{answer.text}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {answer.citations.map((c) => <span key={c} className="chip source">{sources.find((x) => x.id === c)?.title ?? c}</span>)}
                    </div>
                  </>
                ) : <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>…</p>}
              </>
            ) : (
              <>
                {x.angle ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <p style={numStyle}><span ref={angle}>0</span>°<span style={numLabel}>leaf angle</span></p>
                    <p style={{ margin: 0, color: 'var(--ink)' }}>{x.text}</p>
                  </div>
                ) : <p style={{ margin: 0, color: 'var(--ink)' }}>{x.text}</p>}
              </>
            )}
          </div>
        </div>
      ))}
    </Html>
    <Html fullscreen portal={innerWidth > 900 ? undefined : app} calculatePosition={pinToScreen} onOcclude={keepShown} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <div className="story-card" style={{ ...cardStyle, opacity: beat === 'handoff' ? 1 : 0, transition: 'opacity .8s ease' }} aria-hidden={beat !== 'handoff'}>
        <div>
          <p style={{ margin: 0, font: '500 12px/1 var(--mono)', color: 'var(--gold)', letterSpacing: '.14em', textTransform: 'uppercase' }}>{HANDOFF.label}</p>
          <p style={{ margin: '14px 0 0', font: '400 clamp(30px, 4vw, 52px)/1.1 var(--serif)', color: 'var(--ink)' }}>{HANDOFF.text}</p>
        </div>
      </div>
      <div ref={card} className="story-card" style={cardStyle} aria-live="polite">
        <div style={{ maxWidth: 780 }}>
          <p style={{ margin: 0, font: '400 clamp(26px, 3.4vw, 44px)/1.18 var(--serif)', color: 'var(--ink)', letterSpacing: '-.01em' }}>{CARD.problem}</p>
          <p style={{ margin: '18px 0 0', font: '400 clamp(15px, 1.5vw, 19px)/1.5 var(--sans)', color: 'var(--muted)' }}>{CARD.pitch}</p>
          <p style={{ margin: '26px 0 0', font: '500 12px/1 var(--mono)', color: 'var(--gold)', letterSpacing: '.14em', textTransform: 'uppercase' }}>{CARD.place}</p>
        </div>
      </div>
    </Html>
  </>)
}

// Phones: the story's shots are composed for a wide stage, so centre (and fit) each one in the band between the
// controls and the dock or open sheet; the caption sits over the dock or the sheet's top, outside that band.
function phoneShift() {
  if (innerWidth > 900) return null
  const q = (s) => document.querySelector(s)?.getBoundingClientRect(), dock = q('.dock')
  const t = q('.controls')?.bottom ?? 0, b = Math.max(t + 80, Math.min(dock?.height ? dock.top : innerHeight, q('.panel')?.top ?? innerHeight))
  return [0, Math.round((t + b - innerHeight) / 2), Math.min(1.8, Math.max(1, (0.55 * innerHeight) / (b - t)))]
}
// fullscreen Html still follows the world origin's screen point, so the captions drifted with the camera (under the dock at 12 s); pin the layer to the screen.
// The captions render into .app, not the stage's own stacking context, so on phones they can sit over the dock;
// the opening and hand-off cards stay in the stage, under the panel and controls, except on phones, where they cover all.
const pinToScreen = (_, __, size) => [size.width / 2, size.height / 2]
// drei hides the layer (display: none) while its world-origin anchor is behind the camera, as in the pier close-up; the layer is the screen, so never
const keepShown = () => {}
const numStyle = { margin: 0, minWidth: '2.6em', font: '400 44px/1 var(--serif)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const numLabel = { display: 'block', marginTop: 6, font: '500 11px/1 var(--mono)', color: 'var(--muted)', letterSpacing: '.14em', textTransform: 'uppercase' }
const captionBox = { maxWidth: 560, padding: '12px 18px 14px', borderRadius: 14, fontSize: 15, lineHeight: 1.45 }
const cardStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px',
  textAlign: 'center', opacity: 0, background: 'rgba(245,245,247,.72)', backdropFilter: 'var(--blur)', WebkitBackdropFilter: 'var(--blur)',
}

// Aim at the mesh named partId and fit the distance to its bounding sphere (Mechanica's focus fit: radius * 2.4 /
// tan(fov / 2)), measured once per run; null while the bridge has no such mesh, so the key's own pose is used.
function fitPart(scene, camera, r, partId, key) {
  if (!(partId in r.centres)) {
    const obj = scene.getObjectByName(partId)
    r.centres[partId] = obj && new Box3().setFromObject(obj).getBoundingSphere(new Sphere())
  }
  const sphere = r.centres[partId]
  if (!sphere) return null
  const fit = (sphere.radius * 2.4) / Math.tan((camera.fov * Math.PI) / 360)
  return { ...key, target: sphere.center.toArray(), r: Math.max(25, fit * (key.fit ?? 1)) }
}
