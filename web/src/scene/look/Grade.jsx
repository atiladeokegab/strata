// The post stack, in its own chunk (postprocessing is ~350 KB) so the scene is lit before it arrives:
// N8AO (faded with height), light bloom, ACES, the period grade by year, vignette, SMAA.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, BrightnessContrastEffect, Effect, EffectAttribute, ToneMappingMode, VignetteEffect } from 'postprocessing'
import * as THREE from 'three'
import { useStore } from '../../store'
import { periodGrade } from './sun'
import { LITE } from './tier'

const AO = 1.6
// The period grade, luma-weighted on the scene: full desaturation and sepia on mid and dark tones, eased on
// bright stone and ground (sepia lifts pale portland stone to cream), which take a brown soot tint instead; darks
// get a small lift so slate roofs don't sink to black. The sky (no depth) keeps the original full grade, so the
// old-era sky stays as bright as it was; scene() is full up to 30% fog and gone by 90%, so fogged ground at the tile
// edge already matches the depthless skirt and sky beyond it, with no seam. hi uses sqrt(luma), ~sRGB lightness.
// The max(0) matters: saturation > 0 pushes a 0 channel below 0, and the sRGB pow() ahead of
// brightness/contrast turns it into NaN on real GPUs (the exact-black bus rears).
const SCENE_GLSL = `uniform float fogK;
float scene(float depth){float kz=fogK*getViewZ(depth);return depth<1.0?1.0-smoothstep(0.3,0.9,1.0-exp(-kz*kz)):0.0;}
float bright(vec3 c){return smoothstep(0.4,0.8,sqrt(max(dot(c,vec3(0.2126,0.7152,0.0722)),0.0)));}
`
const SAT_GLSL = `uniform float sat;uniform float soot;${SCENE_GLSL}
void mainImage(const in vec4 c,const in vec2 uv,const in float depth,out vec4 o){
  float hi=bright(c.rgb)*scene(depth);vec3 avg=vec3((c.r+c.g+c.b)/3.0);
  // postprocessing's HueSaturation formula (mean, not luma), so the sky and today's frame are unchanged
  vec3 x=sat<0.0?mix(avg,c.rgb,1.0+sat*(1.0-0.5*hi)):min(c.rgb+(avg-c.rgb)*(1.0-1.0/(1.001-sat)),1.0);
  x=max(x,0.0)*mix(vec3(1.0),vec3(0.72,0.68,0.62),soot*hi);
  o=vec4(x+soot*0.025*(1.0-smoothstep(0.0,0.4,sqrt(max(dot(c.rgb,vec3(0.2126,0.7152,0.0722)),0.0)))),c.a);}`
const SEPIA_GLSL = `uniform float amount;${SCENE_GLSL}
void mainImage(const in vec4 c,const in vec2 uv,const in float depth,out vec4 o){
  vec3 s=vec3(dot(c.rgb,vec3(0.393,0.769,0.189)),dot(c.rgb,vec3(0.349,0.686,0.168)),dot(c.rgb,vec3(0.272,0.534,0.131)));
  o=vec4(mix(c.rgb,s,amount*(1.0-0.75*bright(c.rgb)*scene(depth))),c.a);}`
const uniforms = (o) => ({ blendFunction: BlendFunction.SRC, attributes: EffectAttribute.DEPTH, uniforms: new Map(Object.entries(o).map(([k, v]) => [k, new THREE.Uniform(v)])) })
// Lite (phones) keeps only the grade: no AO, bloom or SMAA, so the post stack is 2 passes, not ~20.
export default function Grade({ low }) {
  const fx = useMemo(() => ({
    sat: new Effect('PeriodSaturation', SAT_GLSL, uniforms({ sat: 0, soot: 0, fogK: 0 })),
    bc: new BrightnessContrastEffect(),
    sepia: new Effect('PeriodSepia', SEPIA_GLSL, uniforms({ amount: 0, fogK: 0 })),
    vig: new VignetteEffect({ offset: 0.3, darkness: 0.38 }),
  }), [])
  useEffect(() => () => Object.values(fx).forEach((e) => e.dispose()), [fx])
  const k = useRef(periodGrade(useStore.getState().year))
  const ao = useRef()
  useFrame(({ camera, scene }, dt) => {
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
    fx.sat.uniforms.get('fogK').value = fx.sepia.uniforms.get('fogK').value = scene.fog?.density ?? 0
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
