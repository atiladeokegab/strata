// The guided tour's docent step: going Back to it re-asks, but never while an answer is in flight, and never twice at once.
import { test } from 'node:test'
import assert from 'node:assert/strict'

let clock = 10_000
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true })
let submits = 0
globalThis.HTMLInputElement = class { set value(v) { this._v = v } get value() { return this._v } }
const input = Object.assign(new globalThis.HTMLInputElement(), { dispatchEvent() {}, form: { requestSubmit: () => submits++ } })
globalThis.document = { querySelector: (sel) => (sel === 'form.ask input' ? input : null) }

const { askDocent, frameShift } = await import('./guide.js')
const { useStore } = await import('../store.js')
const busy = (b) => useStore.getState().setDocentBusy(b) // the docent's real in-flight flag
const settle = () => new Promise((r) => setTimeout(r, 100)) // the submit follows the typed value by 60 ms

test('first visit asks once', async () => {
  assert.equal(askDocent(), true)
  await settle()
  assert.equal(submits, 1)
  assert.equal(input.value, 'How do the counterweights help the bascules open?')
})

test('Back straight away does not send again', async () => {
  clock += 200
  assert.equal(askDocent(), false)
  await settle()
  assert.equal(submits, 1)
})

test('Back while the answer is still loading does not send again', async () => {
  clock += 5000
  busy(true)
  assert.equal(askDocent(), false)
  await settle()
  assert.equal(submits, 1)
})

test('Back after the answer arrived asks again', async () => {
  busy(false)
  assert.equal(askDocent(), true)
  await settle()
  assert.equal(submits, 2)
})

test('the camera aims at the stage the card and panels leave clear', () => {
  const at = (rects) => ({ querySelector: (q) => rects[q] && { getBoundingClientRect: () => rects[q] } })
  globalThis.matchMedia = () => ({ matches: false }) // desktop: panel on the left, toggles on the right, card at the bottom
  assert.deepEqual(frameShift(1280, 800, at({ '.panel': { right: 396 }, '.toggles': { left: 1032 }, '.guide-card': { top: 468 } })), [74, -166])
  globalThis.matchMedia = () => ({ matches: true }) // phone: full width, above the card
  assert.deepEqual(frameShift(390, 844, at({ '.panel': { right: 390 }, '.controls': { bottom: 200 }, '.guide-card': { top: 500 } })), [0, -72])
  assert.deepEqual(frameShift(390, 844, at({ '.controls': { bottom: 200 }, '.dock': { top: 540, height: 120 }, '.guide-card': { top: 640 } })), [0, -52])
})
