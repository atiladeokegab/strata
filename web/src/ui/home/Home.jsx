// <Home onEnter={fn} />: the landing stage, "a museum of places". The copy and buttons are plain DOM in the entry
// chunk, so Enter shows within seconds on a slow phone; the turning bridge (HomeStage) and the museum scene load after.
import { Suspense, lazy, useEffect } from 'react'
import { hasGuide, startGuide } from '../slots'
import { startTour } from '../../tour/tour.js'
import './home.css'

const HomeStage = lazy(() => import('./HomeStage'))

// the README's numbers, each with the status its source gives it (data/places/tower-bridge.json)
const FIGURES = [
  ['1 m LiDAR', 'measured', 'Environment Agency, 1.5 km of ground'],
  ['1886 to 1894', 'text-attested', 'built stage by stage, 14 sourced events'],
  ['65 m', 'text-attested', 'the towers, from the City of London'],
  ['86°', 'inferred', 'the bascules at full lift'],
]

export default function Home({ onEnter }) {
  useEffect(() => { // once Home has painted, fetch the museum's scene in the background so Enter is quick
    const go = () => { import('../Stage'); import('../../scene/Terrain.jsx').then((m) => m.loadTerrain()) } // the LiDAR ground was the card's slowest step after Enter
    const id = window.requestIdleCallback ? requestIdleCallback(go, { timeout: 3000 }) : setTimeout(go, 1500)
    return () => (window.cancelIdleCallback ? cancelIdleCallback(id) : clearTimeout(id))
  }, [])
  return (
    <section className="home" aria-label="Strata, a museum of places">
      <div className="home-stage" aria-hidden="true">
        <Suspense fallback={null}><HomeStage /></Suspense>
      </div>
      <div className="home-copy">
        <h1 className="home-title">Strata</h1>
        <p className="home-sub">History is text and flat photos. Strata lets you watch Tower Bridge being built, from real LiDAR and its own sourced history.</p>
        <div className="home-actions">
          {hasGuide && (
            <button type="button" className="primary" onClick={() => { onEnter(); startGuide() }}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>Take the guided tour
            </button>
          )}
          <button type="button" className="home-link" onClick={onEnter}>Enter Tower Bridge</button>
          <button type="button" className={hasGuide ? 'home-link' : 'primary'} onClick={() => { onEnter(); startTour() }}>Play the 60 s story</button>
        </div>
        <dl className="home-figures">
          {FIGURES.map(([n, status, what]) => (
            <div key={n}><dt>{n}</dt><dd><span className={`chip status ${status}`}>{status}</span>{what}</dd></div>
          ))}
        </dl>
        <p className="home-next">Coming next: Stonehenge, Hadrian's Wall, the Tower of London.</p>
      </div>
    </section>
  )
}
