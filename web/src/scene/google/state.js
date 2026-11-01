// Google Photorealistic 3D Tiles status, shared with the terrain (so the grounds never overlap) and the credit pill.
import { create } from 'zustand'
import { useStore } from '../../store'

export const useGoogle = create(() => ({
  status: 'loading', // loading | ready | failed (no key, or the Map Tiles API refused us)
  credit: '', // the copyright string Google requires on screen while its tiles are visible
}))

// Google is today's city: it steps aside for the LiDAR cloud and, before 1950, for the 1890s map and era buildings.
export const HISTORIC_BEFORE = 1950
export const useGoogleWanted = (lidar) => useStore((s) => s.year) >= HISTORIC_BEFORE && !lidar // hook first, never skipped

// True when the photoreal tiles are what the viewer sees (wanted and loaded); terrain and buildings hide while it is.
export function useGoogleShown(lidar) {
  const ready = useGoogle((s) => s.status === 'ready')
  return useGoogleWanted(lidar) && ready
}
