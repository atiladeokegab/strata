import test from 'node:test'
import assert from 'node:assert/strict'
import { readDocentStream } from './docentStream.js'

const delta = (text) => `event: delta\ndata: ${JSON.stringify({ text })}\n\n`
const done = (payload) => `event: done\ndata: ${JSON.stringify(payload)}\n\n`

function response(chunks, close = true, onCancel = () => {}) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      if (close) controller.close()
    },
    cancel: onCancel,
  }))
}

test('decodes UTF-8 split at every byte and returns the final payload', async () => {
  const payload = { answer: 'Tower Bridge — café 🏗️', citations: ['tb-history'], refused: false }
  const bytes = new TextEncoder().encode(delta('Checking 🏗️…') + done(payload))
  const chunks = [...bytes].map((byte) => Uint8Array.of(byte))
  const deltas = []

  assert.deepEqual(await readDocentStream(response(chunks), (text) => deltas.push(text)), payload)
  assert.deepEqual(deltas, ['Checking 🏗️…'])
})

test('parses CRLF frame boundaries and multiple frames in one chunk', async () => {
  const payload = { answer: 'The piers were built first.', citations: ['tb-history'], refused: false }
  const stream = `event: delta\r\ndata: ${JSON.stringify({ text: 'Found a source.' })}\r\n\r\nevent: done\r\ndata: ${JSON.stringify(payload)}\r\n\r\n`
  const deltas = []

  assert.deepEqual(await readDocentStream(response([new TextEncoder().encode(stream)]), (text) => deltas.push(text)), payload)
  assert.deepEqual(deltas, ['Found a source.'])
})

test('returns a final refusal payload instead of treating the delta as the answer', async () => {
  const refused = { answer: 'I cannot verify that number from my sources.', citations: [], refused: true }
  const deltas = []

  const result = await readDocentStream(response([
    new TextEncoder().encode(delta('The bridge is 999 metres tall…') + done(refused)),
  ]), (text) => deltas.push(text))

  assert.deepEqual(deltas, ['The bridge is 999 metres tall…'])
  assert.deepEqual(result, refused)
  assert.notEqual(result.answer, deltas.join(''))
})

test('rejects an incomplete stream and malformed event JSON', async () => {
  await assert.rejects(readDocentStream(response([
    new TextEncoder().encode(delta('Still working…')),
  ]), () => {}), /could not finish/)
  await assert.rejects(readDocentStream(response([
    new TextEncoder().encode('event: delta\ndata: {broken}\n\n'),
  ]), () => {}), SyntaxError)
})

test('cancels and releases the reader as soon as the done frame arrives', async () => {
  let cancelled = false
  const payload = { answer: 'Done.', citations: ['tb-history'], refused: false }
  const stream = response([
    new TextEncoder().encode(done(payload) + delta('must not be read')),
  ], false, () => { cancelled = true })

  assert.deepEqual(await readDocentStream(stream, () => assert.fail('unexpected delta')), payload)
  assert.equal(cancelled, true)
  assert.equal(stream.body.locked, false)
})
