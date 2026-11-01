// The Home page turns the bridge on a round plinth (ui/home/Home.jsx, PLINTH_R = 150 m in the bridge
// frame). Home passes the bridge no prop, so detect it from its own markup: its canvas sits in .home-stage.
// useHomeDisc() is that radius on the home plinth and 0 everywhere else; hide anything whose bridge-frame
// (x, z) lies beyond it, so traffic and river craft don't hang off the edge of the disc.
import { useThree } from '@react-three/fiber'

export const HOME_DISC_R = 150 // keep equal to PLINTH_R in ui/home/Home.jsx
export const useHomeDisc = () => useThree((s) => (s.gl?.domElement?.closest?.('.home-stage') ? HOME_DISC_R : 0))
export const offDisc = (r, x, z, halfLen = 0) => r > 0 && Math.hypot(x, z) > r - halfLen
