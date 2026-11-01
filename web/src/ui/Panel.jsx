// The glass side panel: search, the part inspector and the docent.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

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
        <p className="eyebrow">The structure</p>
        <p className="hint">Click any part of the bridge, or pick one here.</p>
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
      {part.sources?.length > 0 && <div className="sources">{part.sources.map((s) => <SourceChip key={s} id={s} />)}</div>}
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
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [log, busy])
  const ask = async (e) => {
    e.preventDefault()
    const question = q.trim()
    if (!question || busy || !place) return
    setLog((l) => [...l, { who: 'you', text: question }])
    setQ(''); setBusy(true)
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place: place.id, ...(selected ? { part: selected } : {}), question }) })
      if (!r.ok) throw new Error([404, 405].includes(r.status) ? 'The docent is not on this server yet.' : `The docent could not answer just now (${r.status}).`)
      const a = await r.json()
      setLog((l) => [...l, { who: 'docent', text: a.answer, citations: a.citations || [], refused: a.refused }])
    } catch (err) {
      setLog((l) => [...l, { who: 'docent', text: err.message.startsWith('The docent') ? err.message : 'The docent could not answer just now.', error: true }])
    } finally { setBusy(false) }
  }
  return (
    <section className="docent">
      <p className="eyebrow">Ask the docent</p>
      <div className="log">
        {log.length === 0 && <p className="hint">It answers from the sources and says so when it cannot cite one.</p>}
        {log.map((m, i) => (
          <div key={i} className={`msg ${m.who === 'you' ? 'mine' : 'reply'}${m.refused ? ' refused' : ''}${m.error ? ' error' : ''}`}>
            {m.refused && <span className="chip status refused">No source, so no answer</span>}
            <p>{m.text}</p>
            {m.citations?.length > 0 && <div className="sources">{m.citations.map((c) => <SourceChip key={c} id={c} />)}</div>}
          </div>
        ))}
        {busy && <div className="msg reply busy"><span className="dots" aria-label="Thinking"><i /><i /><i /></span></div>}
        <div ref={end} />
      </div>
      <form className="ask" onSubmit={ask}>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500}
          placeholder={part ? `Ask about the ${part.name.toLowerCase()}` : 'How do the bascules open?'} aria-label="Question for the docent" />
        <button type="submit" disabled={busy || !q.trim()}>Ask</button>
      </form>
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
        <Inspector />
        <Docent />
      </div>
    </aside>
  )
}
