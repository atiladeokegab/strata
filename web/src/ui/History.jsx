import { useStore } from '../store'
import { eventAtYear } from '../lib/historyEvent'

function Source({ id, place }) {
  const source = place.sources?.find((item) => item.id === id)
  return source
    ? <a className="chip source" href={source.url} target="_blank" rel="noreferrer" title={source.title}>{source.title}</a>
    : <span className="chip source missing">{id}</span>
}

export default function History() {
  const place = useStore((state) => state.place)
  const year = useStore((state) => state.year)
  if (!place) return null

  const event = eventAtYear(place.events, year)

  return (
    <section className="inspector" aria-live="polite" aria-label="History at selected year">
      <p className="eyebrow">{year} · History</p>
      {event ? <>
        <h2>{event.year} · {event.title}</h2>
        {event.status === 'inferred' && <p><span className="chip status inferred">Inferred stage</span></p>}
        <p className="summary">{event.text}</p>
        {event.sources?.length > 0 && <div className="sources">{event.sources.map((id) => <Source key={id} id={id} place={place} />)}</div>}
      </> : <p className="hint">No recorded history for {year} yet.</p>}
    </section>
  )
}
