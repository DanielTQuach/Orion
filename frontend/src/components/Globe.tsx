/**
 * Globe — CesiumJS Viewer hosting satellite and telescope layers.
 * Receives positions and telescopes as props so App.tsx owns all state.
 */
import { Ion, OpenStreetMapImageryProvider, Cartesian3, Math as CesiumMath } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { Viewer } from 'resium'
import { useRef, useEffect } from 'react'
import type { CesiumComponentRef } from 'resium'
import type { Viewer as CesiumViewer } from 'cesium'
import SatelliteLayer from './SatelliteLayer'
import TelescopeLayer from './TelescopeLayer'
import GroundTrack from './GroundTrack'
import type { SatPosition } from '@/hooks/useSatPositions'
import type { Telescope } from '@/hooks/useTelescopes'

Ion.defaultAccessToken = ''

interface Props {
  satPositions: Map<number, SatPosition>
  telescopes: Telescope[]
  selectedSatId?: number | null
  selectedTelescopeId?: string | null
  onSelectSat?: (id: number) => void
  onSelectTelescope?: (id: string) => void
  flyToTelescope?: Telescope | null
}

export default function Globe({
  satPositions,
  telescopes,
  selectedSatId,
  selectedTelescopeId,
  onSelectSat,
  onSelectTelescope,
  flyToTelescope,
}: Props) {
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null)

  // Apply OSM imagery on mount
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    viewer.imageryLayers.removeAll()
    viewer.imageryLayers.addImageryProvider(
      new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })
    )
  }, [])

  // Fly to telescope when selected from search panel
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer || !flyToTelescope) return
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        flyToTelescope.lon,
        flyToTelescope.lat,
        2_000_000
      ),
      orientation: {
        heading: 0,
        pitch: -CesiumMath.toRadians(90),
        roll: 0,
      },
    })
  }, [flyToTelescope])

  return (
    <Viewer
      ref={viewerRef}
      full
      baseLayerPicker={false}
      geocoder={false}
      homeButton={false}
      sceneModePicker={false}
      navigationHelpButton={false}
      timeline={false}
      animation={false}
    >
      <SatelliteLayer
        positions={satPositions}
        selectedId={selectedSatId}
        onSelect={onSelectSat}
      />
      <TelescopeLayer
        telescopes={telescopes}
        selectedId={selectedTelescopeId}
        onSelect={onSelectTelescope}
      />
      <GroundTrack noradId={selectedSatId ?? null} />
    </Viewer>
  )
}
