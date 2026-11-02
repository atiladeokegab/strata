// One frame number per renderer for the passes that skip frames: the shadow map takes the even frames (Look.jsx)
// and the river's mirror the odd ones (Water.jsx). With a counter each, they fell on the same frame on about half
// of all loads, so desktop frames alternated ~190 and ~390 draw calls instead of ~290 each.
const counts = new WeakMap() // per renderer: Home's plinth canvas and the Stage each keep their own parity
// t: the frame's clock.elapsedTime, the same in every useFrame callback of one frame
export function frameNo(gl, t) {
  let c = counts.get(gl)
  if (!c) counts.set(gl, (c = { n: 0, at: -1 }))
  if (t !== c.at) { c.at = t; c.n++ }
  return c.n
}
