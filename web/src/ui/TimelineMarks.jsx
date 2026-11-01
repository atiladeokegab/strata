// Story markers on the year slider. <TimelineMarks /> goes inside the slider's positioned box (in place of the
// old .ticks); <StoryCard /> goes in the panel. A tick shows its title and year on hover or focus; clicking it
// jumps the year and opens the event's sourced text in the card.
import { useState } from 'react'
import { create } from 'zustand'
import { useStore, FIRST_YEAR, THIS_YEAR } from '../store'
import './TimelineMarks.css'

export const useStory = create((set) => ({ story: null, open: (story) => set({ story }), close: () => set({ story: null }) }))

const pct = (year) => `${((Math.min(Math.max(year, FIRST_YEAR), THIS_YEAR) - FIRST_YEAR) / (THIS_YEAR - FIRST_YEAR)) * 100}%`
// Construction runs 1886 to the 1894 opening; the data marks those events with a build stage.
const isBuild = (e) => e.year >= 1886 && e.year <= 1894

export function TimelineMarks() {
  const events = useStore((s) => s.place?.events) || []
  const setYear = useStore((s) => s.setYear)
  const open = useStory((s) => s.open)
  const current = useStory((s) => s.story)
  const [hover, setHover] = useState(null)
  const jump = (e) => { setYear(e.year); open(e) }
  return (
    <span className="tl-marks">
      {[...events].sort((a, b) => a.year - b.year).map((e) => {
        const key = `${e.year}-${e.title}`
        const kind = isBuild(e) ? 'build' : 'later'
        return (
          <button
            key={key}
            type="button"
            className={`tl-mark ${kind}${current === e ? ' on' : ''}`}
            style={{ left: pct(e.year) }}
            aria-label={`${e.year}: ${e.title}`}
            onClick={(ev) => { ev.preventDefault(); jump(e) }}
            onPointerEnter={() => setHover(key)}
            onPointerLeave={() => setHover((h) => (h === key ? null : h))}
            onFocus={() => setHover(key)}
            onBlur={() => setHover((h) => (h === key ? null : h))}
          >
            <i aria-hidden="true" />
            {hover === key && <span className="tl-tip" role="tooltip"><b className="num">{e.year}</b> {e.title}</span>}
          </button>
        )
      })}
    </span>
  )
}

export function StoryCard() {
  const story = useStory((s) => s.story)
  const close = useStory((s) => s.close)
  const sources = useStore((s) => s.place?.sources) || []
  if (!story) return null
  return (
    <section className="story-card" aria-live="polite">
      <div className="story-head">
        <p className="eyebrow">{isBuild(story) ? 'Construction' : 'History'} · <span className="num">{story.year}</span></p>
        <button type="button" className="close" onClick={close} aria-label="Close the event">×</button>
      </div>
      <h2>{story.title}</h2>
      <p>{story.text}</p>
      {story.sources?.length > 0 && (
        <p className="story-sources">
          {story.sources.map((id) => {
            const s = sources.find((x) => x.id === id)
            return s?.url ? <a key={id} href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : <span key={id}>{s?.title || id}</span>
          })}
        </p>
      )}
    </section>
  )
}

export default TimelineMarks
