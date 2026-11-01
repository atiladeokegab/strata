// "From the archive": real photographs of the bridge (web/public/archive, PD/CC0/CC BY-SA), the one nearest the current year first.
// Tapping a thumbnail sets the year.
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import './archive/archive.css'

const BASE = '/archive/'

export default function Archive() {
  const year = useStore((s) => s.year)
  const setYear = useStore((s) => s.setYear)
  const [items, setItems] = useState([])
  useEffect(() => {
    fetch(`${BASE}manifest.json`).then((r) => (r.ok ? r.json() : { items: [] })).then((m) => setItems(m.items || [])).catch(() => {})
  }, [])
  if (!items.length) return null
  const shown = items.reduce((a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a))
  return (
    <section className="archive">
      <p className="eyebrow">From the archive</p>
      <figure>
        <a href={shown.source} target="_blank" rel="noreferrer"><img src={BASE + shown.file} alt={`${shown.title}, ${shown.date}`} /></a>
        <figcaption>
          <strong>{shown.date}</strong> · {shown.title}
          <span className="archive-credit">
            {shown.author} ·{' '}
            {shown.licence_url ? <a href={shown.licence_url} target="_blank" rel="noreferrer">{shown.licence}</a> : shown.licence} ·{' '}
            <a href={shown.source} target="_blank" rel="noreferrer">Wikimedia Commons</a>
          </span>
        </figcaption>
      </figure>
      <div className="archive-strip">
        {items.map((it) => (
          <button key={it.file} type="button" className={it === shown ? 'on' : ''} onClick={() => setYear(it.year)} title={`${it.date}: ${it.title}`} aria-label={`Go to ${it.year}: ${it.title}`}>
            <img src={BASE + it.file} alt="" loading="lazy" />
            <span>{it.year}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
