import { test } from 'node:test'
import assert from 'node:assert/strict'
import { watchTiles } from './watch.js'

function fake() {
  const t = new EventTarget()
  t.visibleTiles = new Set()
  t.getAttributions = () => (t.visibleTiles.size ? [{ type: 'string', value: 'Google' }] : [])
  t.show = (id) => { t.visibleTiles.add(id); t.dispatchEvent(new Event('tile-visibility-change')) }
  t.hide = (id) => { t.visibleTiles.delete(id); t.dispatchEvent(new Event('tile-visibility-change')) }
  let state = { status: 'loading', credit: '' }
  const seen = []
  const store = { getState: () => state, setState: (s) => { state = { ...state, ...s }; seen.push(state.status) } }
  return { t, store, seen }
}
const tick = () => new Promise((r) => setTimeout(r))

test('ready only while tiles draw, back to loading when none do', async () => {
  const { t, store, seen } = fake()
  watchTiles(t, store)
  t.show('root'); await tick()
  assert.equal(store.getState().status, 'ready')
  assert.equal(store.getState().credit, 'Google')
  t.hide('root'); await tick() // evicted or refused: nothing drawn, so the city stand-ins come back
  assert.equal(store.getState().status, 'loading')
  assert.deepEqual(seen, ['ready', 'loading'])
})

test('a parent swapped for its children in one burst never reads as 0 tiles', async () => {
  const { t, store, seen } = fake()
  watchTiles(t, store)
  t.show('parent'); await tick()
  t.hide('parent'); t.show('a'); t.show('b'); await tick()
  assert.deepEqual(seen, ['ready', 'ready'])
})

test('failed sticks, and the unsubscribe stops updates', async () => {
  const { t, store, seen } = fake()
  const stop = watchTiles(t, store)
  store.setState({ status: 'failed' }); seen.length = 0
  t.show('x'); await tick()
  assert.equal(store.getState().status, 'failed')
  stop(); t.hide('x'); await tick()
  assert.equal(seen.length, 1)
})
