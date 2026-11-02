// Per-pass, per-group draw calls and triangles per frame, counted in three's renderBufferDirect.
// Needs the app at ?capture=1 (Look exposes window.__strataGL) and a dev or preview server. Run through strata-browser:
//   PLAYWRIGHT=$(ls -d ~/.npm/_npx/*/node_modules/playwright | head -1)/index.mjs \
//   strata-browser node web/scripts/profile.mjs 'http://127.0.0.1:5173/?tiles=0&capture=1&lite=0&post=1' [settleMs] [measureMs]
// Waits for the store's sceneSettled (or settleMs), then counts for measureMs. Passes: main (default camera),
// cam:* (another camera: the water mirror), shadow, override (scene.overrideMaterial), post (fullscreen quads).
// Groups: the first named ancestor among the scene's slots. Counts are GPU-independent, but a software
// renderer (SwiftShader) skips N8AO via PerformanceMonitor, and the shadow pass runs every 2nd or 3rd frame.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright')
const [,, url, settle = '240000', measure = '30000'] = process.argv
if (!url) { console.log('usage: node web/scripts/profile.mjs <url with ?capture=1> [settleMs] [measureMs]'); process.exit(2) }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  p.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)))
  await p.goto(url, { timeout: 120000 })
  const t0 = Date.now()
  await p.waitForFunction(() => window.__strataGL && window.__strata?.useStore.getState().sceneSettled, null, { timeout: +settle, polling: 1000 })
    .catch(() => console.log(`no sceneSettled after ${settle} ms; measuring anyway`))
  console.log(`settled after ${Math.round((Date.now() - t0) / 1000)} s; measuring ${measure} ms`)
  await p.evaluate(() => {
    const { gl, get } = window.__strataGL
    const S = (window.__prof = { cells: {}, frames: 0 })
    const SLOTS = /^(tower-bridge|osm-buildings|period-river|landmarks|barrage-balloons)$/
    const group = (o) => {
      const chain = []
      for (let x = o; x; x = x.parent) chain.unshift(x)
      return chain.find((x) => SLOTS.test(x.name))?.name ?? chain.find((x) => /terrain|water|river|thames|google|tiles/i.test(x.name))?.name
        ?? (chain[chain[1]?.name === 'world' ? 2 : 1]?.name || 'other')
    }
    let label = 'main'
    const render = gl.render.bind(gl)
    gl.render = (scene, camera) => {
      const { scene: ms, camera: mc } = get()
      const prev = label
      label = scene !== ms ? 'post' : camera !== mc ? `cam:${camera.name || camera.type}` : scene.overrideMaterial ? 'override' : 'main'
      if (label === 'main') S.frames++
      try { return render(scene, camera) } finally { label = prev }
    }
    const rbd = gl.renderBufferDirect.bind(gl)
    gl.renderBufferDirect = (camera, scene, geometry, material, object, grp) => {
      const pass = scene === null ? 'shadow' : label // three's shadow map passes no scene
      let n = grp ? grp.count : geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0
      n = Math.min(n, geometry.drawRange.count)
      const tris = object.isMesh ? (n / 3) * (object.isInstancedMesh ? object.count : 1) : 0
      const c = (S.cells[`${pass}\t${pass === 'post' ? '-' : group(object)}`] ||= { calls: 0, tris: 0 })
      c.calls++
      c.tris += tris
      return rbd(camera, scene, geometry, material, object, grp)
    }
  })
  await p.waitForTimeout(+measure)
  const r = await p.evaluate(() => {
    const S = window.__prof, f = Math.max(S.frames, 1)
    return { frames: S.frames, rows: Object.entries(S.cells).map(([k, c]) => [k, c.calls / f, c.tris / f]) }
  })
  const totals = {}
  for (const [k, calls, tris] of r.rows) {
    const t = (totals[k.split('\t')[0]] ||= [0, 0])
    t[0] += calls
    t[1] += tris
  }
  const fmt = (calls, tris) => `${calls.toFixed(0).padStart(6)} calls ${(tris / 1000).toFixed(0).padStart(7)}k tris`
  console.log(`${r.frames} frames; per frame (shadow is averaged over frames):`)
  for (const [k, calls, tris] of r.rows.sort((a, b) => b[2] - a[2])) console.log(`  ${k.padEnd(40)}${fmt(calls, tris)}`)
  console.log('per pass:')
  for (const [k, [calls, tris]] of Object.entries(totals)) console.log(`  ${k.padEnd(40)}${fmt(calls, tris)}`)
  const all = Object.values(totals).reduce((a, [c, t]) => [a[0] + c, a[1] + t], [0, 0])
  console.log(`  ${'total'.padEnd(40)}${fmt(...all)}`)
} finally {
  await b.close()
}
