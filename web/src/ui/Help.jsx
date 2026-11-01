// First-visit "How to use" card. Dismissal is remembered per browser; the "?" button in the map controls reopens it.
import { useStore } from '../store'
import { useTour, startTour, stopTour } from '../tour/tour.js'
import { hasGuide, startGuide } from './slots'

const KEY = 'strata.help.seen'
export const helpSeen = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const remember = () => { try { localStorage.setItem(KEY, '1') } catch { /* private mode: show again next visit */ } }

const STEPS = [
  ['Drag to orbit', 'Pinch or scroll to zoom.'],
  ['Scrub the years', 'Watch it built, 1886 to today.'],
  ['Tap a part', 'Its sizes, each with a source.'],
  ['Ask the docent', 'Answers cite their sources.'],
]

export function Help() {
  const open = useStore((s) => s.help)
  const setHelp = useStore((s) => s.setHelp)
  const touring = useTour((s) => s.playing)
  if (!open || touring) return null // the tour has its own captions and end card
  const close = () => { remember(); setHelp(false) }
  return (
    <section className="help glass" role="dialog" aria-label="How to use Strata">
      <p className="eyebrow">How to use</p>
      <ol>
        {STEPS.map(([t, d], i) => <li key={t}><span className="n">{i + 1}</span><b>{t}</b><span className="d">{d}</span></li>)}
      </ol>
      <div className="actions">
        {hasGuide && (
          <button type="button" className="primary" onClick={() => { close(); startGuide() }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>Take the guided tour
          </button>
        )}
        <button type="button" className={hasGuide ? 'secondary' : 'primary'} onClick={() => { close(); startTour() }}>
          {!hasGuide && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>}Play the 60 s story
        </button>
        <button type="button" className="secondary" onClick={close}>Got it</button>
      </div>
    </section>
  )
}

export function StoryButton() {
  const playing = useTour((s) => s.playing)
  return (
    <button type="button" className="story-btn glass" onClick={playing ? stopTour : startTour}>
      <svg viewBox="0 0 16 16" aria-hidden="true">{playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4 2.5v11l9-5.5z" />}</svg>
      {playing ? 'Stop the story' : 'Play the 60 s story'}
    </button>
  )
}

export function HelpButton() {
  const setHelp = useStore((s) => s.setHelp)
  return <button type="button" className="help-btn glass" onClick={() => setHelp(true)} aria-label="How to use" title="How to use">?</button>
}
