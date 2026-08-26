import { Ion, OpenStreetMapImageryProvider } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { Viewer } from 'resium'
import { useRef, useEffect } from 'react'
import type { CesiumComponentRef } from 'resium'
import type { Viewer as CesiumViewer } from 'cesium'

// No Cesium Ion token needed — OSM imagery is free and open
Ion.defaultAccessToken = ''

export default function Globe() {
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null)

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return

    // Clear any default imagery layers and add OSM
    viewer.imageryLayers.removeAll()
    viewer.imageryLayers.addImageryProvider(
      new OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      })
    )
  }, [])

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
    />
  )
}
