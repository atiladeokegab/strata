export async function readDocentStream(response, onDelta) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop()
      if (done && buffer.trim()) frames.push(buffer)
      for (const frame of frames) {
        const lines = frame.split(/\r?\n/)
        const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
        const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (!data || !['delta', 'done'].includes(event)) continue
        const payload = JSON.parse(data)
        if (event === 'delta') onDelta(payload.text)
        else return payload
      }
      if (done) throw new Error('The docent could not finish the answer.')
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
