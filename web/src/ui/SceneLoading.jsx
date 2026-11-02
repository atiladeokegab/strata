// The loading card over the canvas after Enter, until the scene has settled (store.sceneSettled, set by
// ui/ReadyProbe.jsx inside the Canvas). The panel, dock and controls stay usable above it. It waits 250 ms before
// showing, so a fast load never flashes it. No three.js here: this file is in the entry chunk with Home.
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../store'

export const useLoad = create(() => ({ steps: [], frac: 0 }))
const LATE = 20000 // ms: then offer to show the scene as it is

export function SceneLoading() {
  const ready = useStore((s) => s.sceneSettled)
  const { steps, frac } = useLoad()
  const [show, setShow] = useState(false)
  const [late, setLate] = useState(false)
  useEffect(() => {
    const a = setTimeout(() => setShow(true), 250), b = setTimeout(() => setLate(true), LATE)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [])
  if (ready || !show) return null
  const now = steps.find(([, done]) => !done)?.[0] ?? 'Lighting the scene'
  return (
    <div className="scene-loading">
      <div className="scene-loading-card glass">
        <p className="word"><span className="mark" aria-hidden="true" /> Strata</p>
        <p className="what" role="status">Rebuilding Tower Bridge</p>
        <div className="bar" role="progressbar" aria-label="Loading the scene" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
          <span style={{ transform: `scaleX(${Math.max(0.04, frac)})` }} />
        </div>
        <p className="now">{now}</p>
        <ol className="steps">
          {steps.map(([name, done]) => { const n = name.replace(/ \d+ of \d+$/, ''); return <li key={n} className={done ? 'done' : ''}>{n}</li> })}
        </ol>
        {late && <button type="button" onClick={() => useStore.getState().setSceneSettled(true)}>Show it as it is</button>}
      </div>
    </div>
  )
}
