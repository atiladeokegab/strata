// node src/scene/look/grade.check.mjs: a saturated dark colour must stay finite through the grade.
// GLSL can't run here, so this replays the shader maths in order and checks Grade.jsx keeps the clamp in place.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./Grade.jsx', import.meta.url), 'utf8')
const at = (s) => src.indexOf(`<primitive object={fx.${s}}`)
assert.ok(at('sat') >= 0 && at('sat') < at('clamp') && at('clamp') < at('bc'), 'clamp must sit between fx.sat and fx.bc')
assert.match(src, /max\(c\.rgb,0\.0\)/)

// postprocessing 6.37.8 hue-saturation.frag (hue 0), saturation > 0 branch
const sat = (c, s) => { const a = (c[0] + c[1] + c[2]) / 3; return c.map((v) => Math.min(v + (a - v) * (1 - 1 / (1.001 - s)), 1)) }
// three's sRGBTransferOETF, run before BrightnessContrast (inputColorSpace sRGB): mix() evaluates both branches
const oetf = (v) => { const t = v <= 0.0031308 ? 1 : 0; return (Math.pow(v, 0.41666) * 1.055 - 0.055) * (1 - t) + v * 12.92 * t }
const dark = [0, 0.02, 0.03]
assert.ok(sat(dark, 0.04).map(oetf).some(Number.isNaN), 'without the clamp this colour goes NaN (the check can fail)')
for (const s of [0.04, 0.02, 0, -0.36]) {
  const out = sat(dark, s).map((v) => Math.max(v, 0)).map(oetf)
  assert.ok(out.every(Number.isFinite), `saturation ${s}: ${out}`)
}
console.log('grade.check: ok')
