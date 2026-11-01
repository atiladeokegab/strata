// The guided tour's card: one glass card with the step's caption, a spotlight on the control it is about, progress dots,
// Back / Next and Skip. Steps and their live actions live in guide.js. Mount once inside .app.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGuide, goTo, stopGuide, startGuide } from './guide.js'
import { useTour } from './tour.js'
import './guide.css'

const STOP_MS = 3200 // the year step plays its stops on its own until the visitor taps one

function Spotlight({ selector }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    let raf
    const tick = () => {
      const el = ref.current
      const r = selector && document.querySelector(selector)?.getBoundingClientRect()
      if (el) {
        const show = r && r.width > 0 && r.height > 0
        el.style.opacity = show ? 1 : 0
        if (show) Object.assign(el.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` })
      }
      raf = requestAnimationFrame(tick) // follows the target through the sheet opening and layout shifts
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [selector])
  return <div ref={ref} className="guide-spot" aria-hidden="true" />
}

export default function Guide() {
  const { active, i, steps } = useGuide()
  const step = steps[i]
  const [stop, setStop] = useState(0)
  const [auto, setAuto] = useState(true)

  useEffect(() => useTour.subscribe((t) => t.playing && stopGuide()), []) // the 60 s story takes over
  useEffect(() => { if (!useGuide.getState().active) startGuide({ auto: true }) }, []) // first visit: the app opens on the tour
  useEffect(() => { setStop(0); setAuto(true) }, [step])
  useEffect(() => {
    if (!active || !step?.stops || !auto || stop >= step.stops.length - 1) return
    const id = setTimeout(() => { step.stops[stop + 1].run(); setStop(stop + 1) }, STOP_MS)
    return () => clearTimeout(id)
  }, [active, step, stop, auto])
  useEffect(() => {
    if (!active) return
    const key = (e) => e.key === 'Escape' && stopGuide()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [active])

  if (!active || !step) return null
  const last = i === steps.length - 1
  const pick = (k) => { setAuto(false); setStop(k); step.stops[k].run() }
  const extra = step.stops?.[stop].text()
  return (
    <>
      <Spotlight selector={step.spot} />
      <section className={`guide-card glass guide-${step.id}`} role="dialog" aria-label="Guided tour" aria-live="polite">
        <button type="button" className="guide-skip" onClick={stopGuide}>Skip tour</button>
        <p className="eyebrow">Guided tour · {i + 1} of {steps.length}</p>
        <div className="guide-body" key={step.id}>
          <h2>{step.title}</h2>
          <p>{step.text}</p>
          {step.stops && (
            <>
              <div className="guide-stops" role="group" aria-label="Years">
                {step.stops.map((x, k) => (
                  <button key={x.label} type="button" className={`chip${k === stop ? ' on' : ''}`} aria-pressed={k === stop} onClick={() => pick(k)}>{x.label}</button>
                ))}
              </div>
              {extra && <p className="guide-note" key={stop}>{extra}</p>}
            </>
          )}
        </div>
        <div className="guide-foot">
          <div className="guide-dots">
            {steps.map((x, k) => (
              <button key={x.id} type="button" className={k === i ? 'on' : k < i ? 'done' : ''} onClick={() => goTo(k)}
                aria-label={`Step ${k + 1}: ${x.title}`} aria-current={k === i ? 'step' : undefined} />
            ))}
          </div>
          <div className="guide-nav">
            {i > 0 && <button type="button" className="secondary" onClick={() => goTo(i - 1)}>Back</button>}
            <button type="button" className="primary" onClick={() => (last ? stopGuide() : goTo(i + 1))}>{last ? 'Start exploring' : 'Next'}</button>
          </div>
        </div>
      </section>
    </>
  )
}
