// Google's status and credit from the tiles renderer's visibility events (no three or React: watch.test.js runs it in node).
// status is 'ready' only while tiles draw and goes back to 'loading' when none do, so OSM, the terrain and its gap strip
// (useGoogleShown) stand in until tiles really show (live4: 'ready' latched on one tile, then nothing drew). One microtask
// per burst of changes, so a parent swapped for its children never reads as 0 tiles. 'failed' (no key, 403) sticks.
export function watchTiles(t, store) {
  let queued = false
  const update = () => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      const credit = t.getAttributions().filter((a) => a.type === 'string').map((a) => a.value).join(' ')
      const { status } = store.getState()
      store.setState({ credit, status: status === 'failed' ? status : t.visibleTiles.size ? 'ready' : 'loading' })
    })
  }
  t.addEventListener('tile-visibility-change', update)
  return () => t.removeEventListener('tile-visibility-change', update)
}
