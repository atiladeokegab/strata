// <Home onEnter={fn} />: the landing stage, "a museum of places". The copy and buttons are plain DOM in the entry
// chunk, so Enter shows within seconds on a slow phone; the turning bridge (HomeStage) and the museum scene load after.
import { Suspense, lazy, useEffect } from 'react'
import { hasGuide, startGuide } from '../slots'
import { startTour } from '../../tour/tour.js'
import './home.css'

const HomeStage = lazy(() => import('./HomeStage'))

const NEXT = [
  { name: 'Stonehenge', line: 'Lidar picks out the barrows, the Avenue and the Cursus around the stones, earthworks you cannot see on the ground.' },
  { name: "Hadrian's Wall", line: 'Where the stone was robbed away, lidar still traces the Vallum ditch and the line of the wall across the fells.' },
  { name: 'The Tower of London', line: 'Lidar shows the drained moat and the concentric curtain walls in relief around the White Tower.' },
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
        <p className="home-eyebrow">A museum of places</p>
        <h1 className="home-title">
          <span className="home-word">Strata</span>
          <span className="home-sub">History is text and flat photos. Strata lets visitors, students and teachers watch a landmark being built, from real LiDAR and sourced history.</span>
        </h1>
        <div className="home-actions">
          {hasGuide && (
            <button type="button" className="home-story" onClick={() => { onEnter(); startGuide() }}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>Take the guided tour
            </button>
          )}
          <button type="button" className={hasGuide ? 'home-enter' : 'home-story'} onClick={() => { onEnter(); startTour() }}>
            {!hasGuide && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>}Play the 60 s story
          </button>
          <button type="button" className={hasGuide ? 'home-link' : 'home-enter'} onClick={onEnter}>
            Enter Tower Bridge <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      <section className="home-next" aria-label="Coming next">
        <p className="home-next-label">Coming next</p>
        <ul>
          {NEXT.map((p) => (
            <li key={p.name} className="home-card">
              <strong>{p.name} <em className="soon">Soon</em></strong>
              <span>{p.line}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
