import { useState, useMemo, useEffect } from 'react'
import Globe from '@/components/Globe'
import TelescopeSearch from '@/components/TelescopeSearch'
import FilterPanel from '@/components/FilterPanel'
import InfoPanel from '@/components/InfoPanel'
import TimelineScrubber from '@/components/TimelineScrubber'
import AddTelescopeForm from '@/components/AddTelescopeForm'
import { useSatellites } from '@/hooks/useSatellites'
import { useTelescopes } from '@/hooks/useTelescopes'
import { useSatPositions } from '@/hooks/useSatPositions'
import { useReflections } from '@/hooks/useReflections'
import type { SatelliteFilters } from '@/hooks/useSatellites'
import type { Telescope } from '@/hooks/useTelescopes'
import './App.css'

interface SunDirection { x: number; y: number; z: number }

const styles: Record<string, React.CSSProperties> = {
  addBtn: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    padding: '7px 14px',
    borderRadius: 4,
    border: '1px solid #2a3a4a',
    background: 'rgba(15,20,30,0.88)',
    color: '#e0e8f0',
    fontSize: 13,
    cursor: 'pointer',
    zIndex: 100,
  },
}

export default function App() {
  const [filters, setFilters] = useState<SatelliteFilters>({})
  const [selectedSatId, setSelectedSatId] = useState<number | null>(null)
  const [selectedTelescopeId, setSelectedTelescopeId] = useState<string | null>(null)
  const [flyToTelescope, setFlyToTelescope] = useState<Telescope | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [predicting, setPredicting] = useState(false)
  const [sunDirection, setSunDirection] = useState<SunDirection | null>(null)

  // Data hooks
  const { satellites } = useSatellites(filters)
  const { telescopes } = useTelescopes()

  // Extract NORAD IDs to propagate
  const noradIds = useMemo(() => satellites.map(s => s.norad_id), [satellites])
  const { positions: satPositions } = useSatPositions(noradIds)

  // Reflection events for selected telescope
  const { events, reflectingIds, refetch: refetchReflections } = useReflections(selectedTelescopeId)

  // Fetch sun direction once on mount and refresh every 5 minutes
  useEffect(() => {
    const load = () =>
      fetch('/api/sun')
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setSunDirection({ x: d.x, y: d.y, z: d.z }))
        .catch(() => {})
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // Trigger a scan when a telescope is selected
  const runScan = async (telescopeId: string) => {
    await fetch('/api/reflections/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telescope_id: telescopeId, hours_ahead: 1.0 }),
    })
    refetchReflections()
  }

  // Kick off 24hr background prediction
  const runPredict = async () => {
    if (!selectedTelescopeId || predicting) return
    setPredicting(true)
    await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telescope_id: selectedTelescopeId, hours_ahead: 24 }),
    })
    setTimeout(() => { setPredicting(false); refetchReflections() }, 3000)
  }

  const handleTelescopeSelect = (telescope: Telescope) => {
    setSelectedTelescopeId(telescope.telescope_id)
    setFlyToTelescope(telescope)
    runScan(telescope.telescope_id)
  }

  const selectedSatPosition = selectedSatId ? satPositions.get(selectedSatId) : null

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'relative' }}>
      <Globe
        satPositions={satPositions}
        telescopes={telescopes}
        selectedSatId={selectedSatId}
        selectedTelescopeId={selectedTelescopeId}
        onSelectSat={setSelectedSatId}
        onSelectTelescope={setSelectedTelescopeId}
        flyToTelescope={flyToTelescope}
        reflectingIds={reflectingIds}
        sunDirection={sunDirection}
      />
      <TelescopeSearch
        onSelect={handleTelescopeSelect}
        selectedId={selectedTelescopeId}
      />
      <FilterPanel filters={filters} onChange={setFilters} />
      {/* Info panel shown only when no telescope is selected (satellite selected) */}
      {selectedSatId && !selectedTelescopeId && (
        <InfoPanel
          satellite={selectedSatPosition}
          telescope={null}
          onClose={() => setSelectedSatId(null)}
        />
      )}

      {/* Timeline shown when a telescope is selected */}
      {selectedTelescopeId && !selectedSatId && (
        <TimelineScrubber
          events={events}
          telescopeId={selectedTelescopeId}
          onPredict={runPredict}
          predicting={predicting}
        />
      )}

      {/* Add telescope button */}
      <button style={styles.addBtn} onClick={() => setShowAddForm(true)}>+ Add Telescope</button>

      {showAddForm && (
        <AddTelescopeForm
          onAdded={() => { }}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}
