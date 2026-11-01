// Judges' phones and ordinary laptops: touch-first or <= 4 cores gets the lite tier. ?lite=1 / ?lite=0 forces it.
const force = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lite') : null
export const LITE = force != null ? force === '1'
  : typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4)
