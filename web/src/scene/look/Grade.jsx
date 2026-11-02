// The post stack, in its own chunk (postprocessing is ~350 KB) so the scene is lit before it arrives:
// N8AO (faded with height), light bloom, ACES, the period grade by year, vignette, SMAA.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, BrightnessContrastEffect, Effect, ToneMappingMode, VignetteEffect } from 'postprocessing'
import * as THREE from 'three'
import { useStore } from '../../store'
import { periodGrade } from './sun'
import { LITE } from './tier'

const AO = 1.6
// The period grade, luma-weighted: full desaturation and sepia on mid and dark tones, eased on bright ones
// (sepia lifts pale portland stone to cream), which instead take a brown soot tint; darks get a small lift so
// slate roofs don't sink to black beside the darker stone. hi uses sqrt(luma), ~sRGB lightness.
// The max(0) matters: saturation > 0 pushes a 0 channel below 0, and the sRGB pow() ahead of
// brightness/contrast turns it into NaN on real GPUs (the exact-black bus rears).
const SAT_GLSL = `uniform float sat;uniform float soot;
void mainImage(const in vec4 c,const in vec2 uv,out vec4 o){
  float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));float hi=smoothstep(0.4,0.8,sqrt(max(l,0.0)));
  // sat > 0 (from 1986 on) is postprocessing's HueSaturation formula exactly, so today's frame is unchanged
  vec3 x=sat<0.0?mix(vec3(l),c.rgb,1.0+sat*(1.0-0.5*hi)):min(c.rgb+(vec3((c.r+c.g+c.b)/3.0)-c.rgb)*(1.0-1.0/(1.001-sat)),1.0);
  x=max(x,0.0)*mix(vec3(1.0),vec3(0.72,0.68,0.62),soot*hi);
  o=vec4(x+soot*0.025*(1.0-smoothstep(0.0,0.4,sqrt(max(l,0.0)))),c.a);}`
const SEPIA_GLSL = `uniform float amount;
void mainImage(const in vec4 c,const in vec2 uv,out vec4 o){
  vec3 s=vec3(dot(c.rgb,vec3(0.393,0.769,0.189)),dot(c.rgb,vec3(0.349,0.686,0.168)),dot(c.rgb,vec3(0.272,0.534,0.131)));
  float hi=smoothstep(0.4,0.8,sqrt(max(dot(c.rgb,vec3(0.2126,0.7152,0.0722)),0.0)));
  o=vec4(mix(c.rgb,s,amount*(1.0-0.75*hi)),c.a);}`
const uniforms = (o) => ({ blendFunction: BlendFunction.SRC, uniforms: new Map(Object.entries(o).map(([k, v]) => [k, new THREE.Uniform(v)])) })
// Lite (phones) keeps only the grade: no AO, bloom or SMAA, so the post stack is 2 passes, not ~20.
export default function Grade({ low }) {
  const fx = useMemo(() => ({
    sat: new Effect('PeriodSaturation', SAT_GLSL, uniforms({ sat: 0, soot: 0 })),
    bc: new BrightnessContrastEffect(),
    sepia: new Effect('PeriodSepia', SEPIA_GLSL, uniforms({ amount: 0 })),
    vig: new VignetteEffect({ offset: 0.3, darkness: 0.38 }),
  }), [])
  useEffect(() => () => Object.values(fx).forEach((e) => e.dispose()), [fx])
  const k = useRef(periodGrade(useStore.getState().year))
  const ao = useRef()
  useFrame(({ camera }, dt) => {
    // AO grounds things up close; from altitude it only greys the dense LiDAR roofscape, so fade it out
    if (ao.current) {
      // N8AO otherwise traverses the scene each frame and, finding any transparent material (glass, fading
      // tiles), renders the whole scene twice more for transparency: drop that, AO behind glass is fine.
      ao.current.autoDetectTransparency = false
      ao.current.configuration.transparencyAware = false
    }
    if (ao.current) ao.current.configuration.intensity = AO * (1 - 0.75 * THREE.MathUtils.smoothstep(camera.position.y, 150, 900))
    const p = (k.current = THREE.MathUtils.damp(k.current, periodGrade(useStore.getState().year), 4, dt))
    fx.sat.uniforms.get('sat').value = 0.04 - 0.4 * p
    fx.sat.uniforms.get('soot').value = p
    fx.sepia.uniforms.get('amount').value = 0.42 * p
    fx.bc.contrast = 0.08 - 0.05 * p
    fx.bc.brightness = 0.01 * p
    fx.vig.darkness = 0.38 + 0.2 * p
  })
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {!low && !LITE && <N8AO ref={ao} halfRes aoRadius={2} distanceFalloff={1} intensity={AO} quality="medium" />}
      {!LITE && <Bloom mipmapBlur levels={5} intensity={0.3} luminanceThreshold={1} luminanceSmoothing={0.2} />}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={fx.sat} dispose={null} />
      <primitive object={fx.bc} dispose={null} />
      <primitive object={fx.sepia} dispose={null} />
      <primitive object={fx.vig} dispose={null} />
      {!LITE && <SMAA />}
    </EffectComposer>
  )
}
