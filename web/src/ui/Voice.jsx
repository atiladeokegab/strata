// Talk to the docent: a mic button, WebRTC straight to the OpenAI Realtime API using an ephemeral
// secret from POST /api/voice/session (the API key stays on the server), and a live transcript.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

const LABEL = { idle: 'Talk to the docent', connecting: 'Connecting…', listening: 'Listening', speaking: 'Speaking', error: 'Try again' }

export default function Voice() {
  const [state, setState] = useState('idle')
  const [lines, setLines] = useState([]) // [{id, who: 'you'|'docent', text}]
  const [error, setError] = useState(null)
  const conn = useRef(null) // {pc, dc, mic, audio, instructions}
  const selected = useStore((s) => s.selected)

  const upsert = (id, who, update) =>
    setLines((ls) => {
      const i = ls.findIndex((l) => l.id === id)
      if (i < 0) return [...ls, { id, who, text: update('') }]
      const next = ls.slice()
      next[i] = { ...ls[i], text: update(ls[i].text) }
      return next
    })

  const send = (msg) => conn.current?.dc.readyState === 'open' && conn.current.dc.send(JSON.stringify(msg))

  // Tell the docent which part the visitor is looking at; instructions are replaced whole, so rebuild them.
  const sendContext = () => {
    const c = conn.current
    if (!c) return
    const { selected: id, place } = useStore.getState()
    const part = place?.parts?.find((p) => p.id === id)
    const focus = id ? `\nThe visitor has selected ${part ? `${part.name} (id ${id})` : id}. "This" or "it" probably means that part.` : ''
    send({ type: 'session.update', session: { type: 'realtime', instructions: c.instructions + focus } })
  }

  const onEvent = (e) => {
    switch (e.type) {
      case 'input_audio_buffer.speech_started': return setState('listening')
      case 'input_audio_buffer.committed': return upsert(e.item_id, 'you', (t) => t || '…')
      case 'conversation.item.input_audio_transcription.completed':
        if (!e.transcript.trim()) return setLines((ls) => ls.filter((l) => l.id !== e.item_id)) // noise, not speech
        return upsert(e.item_id, 'you', () => e.transcript.trim())
      case 'response.output_audio_transcript.delta': return upsert(e.item_id, 'docent', (t) => t + e.delta)
      case 'output_audio_buffer.started': return setState('speaking')
      case 'output_audio_buffer.stopped': return setState('listening')
      case 'response.function_call_arguments.done': {
        let ok = false
        if (e.name === 'select_part') {
          const { id } = JSON.parse(e.arguments || '{}')
          ok = !!useStore.getState().place?.parts?.some((p) => p.id === id)
          if (ok) useStore.getState().select(id)
        }
        send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: e.call_id, output: JSON.stringify({ ok }) } })
        return send({ type: 'response.create' })
      }
      case 'error': return setError(e.error?.message || 'voice error')
    }
  }

  const stop = () => {
    const c = conn.current
    conn.current = null
    if (!c) return
    c.dc?.close()
    c.pc.close()
    c.mic?.getTracks().forEach((t) => t.stop())
    c.audio.srcObject = null
  }

  const start = async () => {
    setError(null)
    setState('connecting')
    const pc = new RTCPeerConnection()
    const audio = new Audio()
    audio.autoplay = true
    conn.current = { pc, audio }
    try {
      const r = await fetch('/api/voice/session', { method: 'POST' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `session ${r.status}`)
      const s = await r.json()
      pc.ontrack = (ev) => { audio.srcObject = ev.streams[0] }
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      mic.getTracks().forEach((t) => pc.addTrack(t, mic))
      const dc = pc.createDataChannel('oai-events')
      Object.assign(conn.current, { mic, dc, instructions: s.instructions })
      dc.onopen = () => { setState('listening'); sendContext() }
      dc.onmessage = (m) => onEvent(JSON.parse(m.data))
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed'].includes(pc.connectionState) && conn.current?.pc === pc) { stop(); setState('idle') }
      }
      await pc.setLocalDescription(await pc.createOffer())
      const answer = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(s.model)}`, {
        method: 'POST',
        body: pc.localDescription.sdp,
        headers: { Authorization: `Bearer ${s.value}`, 'Content-Type': 'application/sdp' },
      })
      if (!answer.ok) throw new Error(`realtime ${answer.status}`)
      await pc.setRemoteDescription({ type: 'answer', sdp: await answer.text() })
    } catch (err) {
      stop()
      setError(err.name === 'NotAllowedError' ? 'Microphone permission was refused.' : err.message)
      setState('error')
    }
  }

  useEffect(() => { sendContext() }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stop, [])

  const live = state === 'listening' || state === 'speaking' || state === 'connecting'
  return (
    <section aria-label="Talk to the docent" className="voice-ui">
      <button type="button" className="voice-btn" onClick={() => (live ? (stop(), setState('idle')) : start())} aria-pressed={live}>
        <span aria-hidden className={`voice-dot ${state}`} />
        <span>{LABEL[state]}</span>
        {live && <span className="voice-stop">Stop</span>}
      </button>
      {error && <p role="alert" className="voice-err">{error}</p>}
      {lines.length > 0 && (
        <ol aria-live="polite" className="voice-log">
          {lines.map((l) => (
            <li key={l.id}><strong>{l.who === 'you' ? 'You' : 'Docent'}:</strong> {l.text}</li>
          ))}
        </ol>
      )}
    </section>
  )
}
