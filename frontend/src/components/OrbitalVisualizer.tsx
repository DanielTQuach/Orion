import Globe from '@/components/Globe'
import type { SatPosition } from '@/hooks/useSatPositions'
import type { Telescope } from '@/hooks/useTelescopes'

interface SunDirection {
  x: number
  y: number
  z: number
}

interface Props {
  satPositions: Map<number, SatPosition>
  telescopes: Telescope[]
  selectedSatId?: number | null
  selectedTelescopeId?: string | null
  onSelectSat?: (id: number) => void
  onSelectTelescope?: (id: string) => void
  flyToTelescope?: Telescope | null
  reflectingIds?: Set<number>
  sunDirection?: SunDirection | null
}

/** Orion Cesium globe mounted inside the dashboard orbital visualizer panel. */
export function OrbitalVisualizer(props: Props) {
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-sm">
      <Globe {...props} />
    </div>
  )
}
