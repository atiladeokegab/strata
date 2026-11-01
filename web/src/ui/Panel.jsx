// The glass side panel: search, the place card, the part inspector and the docent.
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useTour, startTour, stopTour } from '../tour/tour.js'
const Voice = lazy(() => import('./Voice'))
import { StoryCard } from './TimelineMarks'
import { readDocentStream } from '../lib/docentStream'

const STATUS = { 'text-attested': 'Text-attested', measured: 'Measured', inferred: 'Inferred' }
const label = (k) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-GB') : v)

function SourceChip({ id }) {
  const src = useStore((s) => s.place?.sources.find((x) => x.id === id))
  if (!src) return <span className="chip source missing" title="Source not found in the place data">{id}</span>
  return <a className="chip source" href={src.url} target="_blank" rel="noreferrer" title={src.title}>{src.title}</a>
}

export function StatusChip({ status }) {
  return <span className={`chip status ${status}`}>{STATUS[status] || status}</span>
}

function Search() {
  const place = useStore((s) => s.place)
  const select = useStore((s) => s.select)
  const setYear = useStore((s) => s.setYear)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  useEffect(() => {
    const term = q.trim()
    if (!term) { setHits([]); return }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        if (!r.ok) throw new Error(r.status)
        setHits(await r.json())
      } catch (e) {
        if (e.name === 'AbortError' || !place) return
        // shortcut: until /api/search is live, search the loaded place data in the browser
        const has = (...s) => s.some((x) => x?.toLowerCase().includes(term.toLowerCase()))
        setHits([
          ...place.parts.filter((p) => has(p.name, p.summary, p.group)).map((p) => ({ kind: 'part', id: p.id, title: p.name, snippet: p.summary })),
          ...place.events.filter((v) => has(v.title, v.text, String(v.year))).map((v) => ({ kind: 'event', id: String(v.year), title: `${v.year} · ${v.title}`, snippet: v.text })),
          ...place.sources.filter((s) => has(s.title)).map((s) => ({ kind: 'source', id: s.id, title: s.title, snippet: s.kind })),
        ])
      }
    }, 180)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q, place])
  const open = (h) => {
    if (h.kind === 'part') select(h.id)
    else if (h.kind === 'event') { const y = `${h.id} ${h.title}`.match(/\b(18|19|20)\d\d\b/); if (y) setYear(Number(y[0])) }
    else { const s = place.sources.find((x) => x.id === h.id); if (s) window.open(s.url, '_blank', 'noreferrer') }
    setQ('')
  }
  return (
    <div className="search">
      <input type="search" placeholder="Search parts, events, sources" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      {q.trim() && (
        <ul className="hits" role="listbox">
          {hits.length === 0 && <li className="none">Nothing found for “{q.trim()}”</li>}
          {hits.slice(0, 8).map((h) => (
            <li key={h.kind + h.id}>
              <button type="button" onClick={() => open(h)}>
                <span className="kind">{h.kind}</span>
                <span className="t">{h.title}</span>
                {h.snippet && <span className="s">{h.snippet}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Inspector() {
  const place = useStore((s) => s.place)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const part = place?.parts.find((p) => p.id === selected)
  if (!place) return null
  if (!part) {
    return (
      <section className="inspector">
        <p className="eyebrow">The parts</p>
        <p className="hint">Tap any part of the bridge, or pick one here.</p>
        <div className="parts">
          {place.parts.map((p) => <button key={p.id} type="button" onClick={() => select(p.id)}>{p.name}</button>)}
        </div>
      </section>
    )
  }
  return (
    <section className="inspector" aria-live="polite">
      <div className="inspector-head">
        <p className="eyebrow">{part.group}</p>
        <button type="button" className="close" onClick={() => select(null)} aria-label="Close the part">×</button>
      </div>
      <h2>{part.name}</h2>
      {part.summary && <p className="summary">{part.summary}</p>}
      {Object.keys(part.dims || {}).length > 0 && (
        <dl className="dims">
          {Object.entries(part.dims).map(([k, d]) => (
            <div key={k} className="dim">
              <dt>{label(k)}</dt>
              <dd><span className="num">{fmt(d.value)}</span> <span className="unit">{d.unit}</span></dd>
              <dd className="chips"><StatusChip status={d.status} /><SourceChip id={d.source} /></dd>
            </div>
          ))}
        </dl>
      )}
      {/bascule|accumulator/.test(part.id) && <Hydraulics />}
      {part.sources?.length > 0 && <div className="sources">{part.sources.map((s) => <SourceChip key={s} id={s} />)}</div>}
    </section>
  )
}

// live readout of the simulated hydraulics the bridge runs; refreshed ten times a second
function Hydraulics() {
  const [h, setH] = useState(null)
  useEffect(() => {
    let t
    // same chunk the bridge slot already loads, so the bridge stays out of the first paint
    import('../scene/bridge/TowerBridge.jsx').then(({ bridgeHydraulics: sim }) => { t = setInterval(() => setH({ ...sim }), 100) })
    return () => clearInterval(t)
  }, [])
  if (!h) return null
  const deg = (h.angle * 180) / Math.PI
  const rows = [
    ['Leaf angle', `${deg.toFixed(1)}°`],
    ['Swing rate', `${((h.omega * 180) / Math.PI).toFixed(2)}°/s`],
    ['Accumulator', `${Math.round(h.stored * 100)}%`],
    ['Pumps', h.pumping ? 'Running' : 'Idle'],
    ['Valve', h.valve > 0.02 ? 'Raising' : h.valve < -0.02 ? 'Lowering' : 'Shut'],
  ]
  return (
    <div className="hydraulics" aria-live="off">
      <p className="eyebrow">Hydraulics, live <StatusChip status="inferred" /></p>
      <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
      <p className="hint small">Simulated from the 750 psi accumulator system. Move the bascule slider to work it.</p>
    </div>
  )
}

function PlaceCard() {
  const place = useStore((s) => s.place)
  const selected = useStore((s) => s.selected)
  const touring = useTour((s) => s.playing)
  if (!place || selected) return null
  const opened = place.events?.find((e) => /open/i.test(e.title))
  return (
    <section className="place-card">
      <h1>{place.name}</h1>
      <p className="where">{[place.location?.label || place.location?.name || 'River Thames, London', opened && `Opened ${opened.year}`].filter(Boolean).join(' · ')}</p>
      <button type="button" className="primary" onClick={touring ? stopTour : startTour}>
        <svg viewBox="0 0 16 16" aria-hidden="true">{touring ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4 2.5v11l9-5.5z" />}</svg>
        {touring ? 'Stop the story' : 'Play the story'}
      </button>
    </section>
  )
}

function Docent() {
  const place = useStore((s) => s.place)
  const selected = useStore((s) => s.selected)
  const part = place?.parts.find((p) => p.id === selected)
  const [log, setLog] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [talk, setTalk] = useState(false)
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [log, busy])
  const ask = async (e) => {
    e.preventDefault()
    const question = q.trim()
    if (!question || busy || !place) return
    setLog((l) => [...l, { who: 'you', text: question }, { who: 'docent', text: '', live: true }])
    setQ(''); setBusy(true)
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ place: place.id, ...(selected ? { part: selected } : {}), question }) })
      if (!r.ok) throw new Error([404, 405].includes(r.status) ? 'The docent is not on this server yet.' : `The docent could not answer just now (${r.status}).`)
      const a = !(r.headers.get('content-type') || '').includes('event-stream') ? await r.json() : await readDocentStream(r, (text) => {
        setLog((l) => l.map((m, i) => i === l.length - 1 ? { ...m, text: m.text + text } : m))
      })
      setLog((l) => l.map((m, i) => i === l.length - 1 ? { ...m, text: a.answer, citations: a.citations || [], refused: a.refused, live: false } : m))
    } catch (err) {
      setLog((l) => l.map((m, i) => i === l.length - 1 ? { ...m, text: err.message.startsWith('The docent') ? err.message : 'The docent could not answer just now.', error: true, live: false } : m))
    } finally { setBusy(false) }
  }
  return (
    <section className="docent">
      <p className="eyebrow">Ask the docent</p>
      <div className="log">
        {log.length === 0 && <p className="hint">It answers from the sources and says so when it cannot cite one.</p>}
        {log.map((m, i) => (
          <div key={i} className={`msg ${m.who === 'you' ? 'mine' : 'reply'}${m.refused ? ' refused' : ''}${m.error ? ' error' : ''}${m.live ? ' live' : ''}`}>
            {m.refused && <span className="chip status refused">No source, so no answer</span>}
            <p>{m.text}</p>
            {m.citations?.length > 0 && <div className="sources">{m.citations.map((c) => <SourceChip key={c} id={c} />)}</div>}
          </div>
        ))}
        {busy && !log.at(-1)?.text && <div className="msg reply busy"><span className="dots" aria-label="Thinking"><i /><i /><i /></span></div>}
        <div ref={end} />
      </div>
      <form className="ask" onSubmit={ask}>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500}
          placeholder={part ? `Ask about the ${part.name.toLowerCase()}` : 'How do the bascules open?'} aria-label="Question for the docent" />
        <button type="button" className={`icon${talk ? ' on' : ''}`} aria-pressed={talk} onClick={() => setTalk(!talk)} aria-label="Talk to the docent" title="Talk to the docent">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0V4A2.5 2.5 0 0 0 8 1.5zM3.5 7.5a.75.75 0 0 1 1.5 0 3 3 0 0 0 6 0 .75.75 0 0 1 1.5 0 4.5 4.5 0 0 1-3.75 4.44V14h-1.5v-2.06A4.5 4.5 0 0 1 3.5 7.5z" /></svg>
        </button>
        <button type="submit" disabled={busy || !q.trim()}>Ask</button>
      </form>
      {talk && <div className="voice"><Suspense fallback={null}><Voice /></Suspense></div>}
    </section>
  )
}

export function Panel() {
  const place = useStore((s) => s.place)
  return (
    <aside className="panel glass">
      <header className="brand">
        <span className="mark" aria-hidden="true" />
        <span className="word">Strata</span>
        {place && <span className="place">{place.name}</span>}
      </header>
      <Search />
      <div className="scroll">
        <PlaceCard />
        <StoryCard />
        <Inspector />
        <Docent />
      </div>
    </aside>
  )
}
