// node src/scene/look/grade.check.mjs: a saturated dark colour must stay finite through the grade.
// GLSL can't run here, so this replays the shader maths in order and checks Grade.jsx keeps the clamp in place.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./Grade.jsx', import.meta.url), 'utf8')
const at = (s) => src.indexOf(`<primitive object={fx.${s}}`)
assert.ok(at('sat') >= 0 && at('sat') < at('bc'), 'the saturation effect (with its clamp) must run before fx.bc')
assert.match(src, /x=max\(x,0\.0\)\*/, 'PeriodSaturation must clamp its output at 0')

// PeriodSaturation (Grade.jsx SAT_GLSL), today's grade: sat > 0, soot 0
const sat = (c, s, clamp) => {
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  return c.map((v) => { const x = l + (v - l) * (1 + s); return clamp ? Math.max(x, 0) : x })
}
// three's sRGBTransferOETF, run before BrightnessContrast (inputColorSpace sRGB): mix() evaluates both branches
const oetf = (v) => { const t = v <= 0.0031308 ? 1 : 0; return (Math.pow(v, 0.41666) * 1.055 - 0.055) * (1 - t) + v * 12.92 * t }
const dark = [0, 0.02, 0.03]
assert.ok(sat(dark, 0.04, false).map(oetf).some(Number.isNaN), 'without the clamp this colour goes NaN (the check can fail)')
for (const s of [0.04, 0.02, 0, -0.36]) {
  const out = sat(dark, s, true).map(oetf)
  assert.ok(out.every(Number.isFinite), `saturation ${s}: ${out}`)
}
console.log('grade.check: ok')
