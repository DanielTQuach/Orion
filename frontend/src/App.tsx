import { useState, useMemo, useEffect } from 'react'
import { OrbitalVisualizer } from '@/components/OrbitalVisualizer'
import { Panel } from '@/components/dashboard-parts'
import TleStatusBanner from '@/components/TleStatusBanner'
import NearbyPanel from '@/components/NearbyPanel'
import { cn } from '@/lib/utils'
import { useSatellites } from '@/hooks/useSatellites'
import { useTelescopes } from '@/hooks/useTelescopes'
import { useSatPositions } from '@/hooks/useSatPositions'
import { useReflections } from '@/hooks/useReflections'
import type { Telescope } from '@/hooks/useTelescopes'

interface SunDirection {
  x: number
  y: number
  z: number
}

export default function App() {
  const [selectedSatId, setSelectedSatId] = useState<number | null>(null)
  const [selectedTelescopeId, setSelectedTelescopeId] = useState<string | null>(null)
  const [flyToTelescope, setFlyToTelescope] = useState<Telescope | null>(null)
  const [scanning, setScanning] = useState(false)
  const [sunDirection, setSunDirection] = useState<SunDirection | null>(null)

  const { satellites } = useSatellites({})
  const { telescopes, loading: telescopesLoading } = useTelescopes()
  const noradIds = useMemo(() => satellites.map(s => s.norad_id), [satellites])
  const { positions: satPositions } = useSatPositions(noradIds)
  const { events, reflectingIds, refetch: refetchReflections } = useReflections(selectedTelescopeId)

  const satNameById = useMemo(() => {
    const map = new Map<number, string>()
    satellites.forEach(s => map.set(s.norad_id, s.name))
    satPositions.forEach(p => map.set(p.norad_id, p.name))
    return map
  }, [satellites, satPositions])

  useEffect(() => {
    if (!selectedTelescopeId && telescopes.length > 0) {
      const first = telescopes[0]!
      setSelectedTelescopeId(first.telescope_id)
      setFlyToTelescope(first)
    }
  }, [telescopes, selectedTelescopeId])

  useEffect(() => {
    const load = () =>
      fetch('/api/sun')
        .then(r => (r.ok ? r.json() : null))
        .then(d => d && setSunDirection({ x: d.x, y: d.y, z: d.z }))
        .catch(() => {})
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const selectedTelescope = useMemo(
    () => telescopes.find(t => t.telescope_id === selectedTelescopeId) ?? null,
    [telescopes, selectedTelescopeId],
  )

  const runScan = async (telescopeId: string) => {
    setScanning(true)
    try {
      await fetch('/api/reflections/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telescope_id: telescopeId, hours_ahead: 1.0 }),
      })
      await refetchReflections()
    } finally {
      setScanning(false)
    }
  }

  const handleTelescopeSelect = (telescope: Telescope) => {
    setSelectedTelescopeId(telescope.telescope_id)
    setSelectedSatId(null)
    setFlyToTelescope(telescope)
    runScan(telescope.telescope_id)
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <TleStatusBanner />

      <header className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/60 bg-primary/10">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
            </div>
            <div>
              <h1 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
                Orion
              </h1>
              <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
                See when satellites pass near a telescope and may interfere with observations.
              </p>
            </div>
          </div>
          <div className="hidden font-mono text-[10px] text-muted-foreground sm:block">
            {satellites.length} satellites · {telescopes.length} telescopes
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[260px_1fr_300px]">
        {/* Step 1: pick a telescope */}
        <Panel title="1. Choose a telescope" meta={`${telescopes.length}`} className="h-full">
          <div className="space-y-2">
            {telescopesLoading && (
              <p className="font-mono text-[11px] text-muted-foreground">Loading…</p>
            )}
            {telescopes.map(t => {
              const active = t.telescope_id === selectedTelescopeId
              return (
                <button
                  key={t.telescope_id}
                  type="button"
                  onClick={() => handleTelescopeSelect(t)}
                  className={cn(
                    'w-full rounded-sm border p-2.5 text-left transition-colors',
                    active
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border/60 bg-muted/40 hover:border-primary/40 hover:bg-muted',
                  )}
                >
                  <div className="font-mono text-xs font-semibold text-foreground">{t.telescope_id}</div>
                  <div className="mt-1 text-[13px] font-medium text-foreground">{t.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {t.lat.toFixed(2)}°, {t.lon.toFixed(2)}°
                  </div>
                </button>
              )
            })}
          </div>
        </Panel>

        {/* Step 2: see it on the globe */}
        <Panel
          title="2. Watch the sky"
          meta={selectedTelescope?.name ?? 'select a telescope'}
          className="relative h-full"
          bodyClassName="relative min-h-0 flex-1 overflow-hidden p-0"
        >
          <div className="hud-grid pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative z-10 h-full min-h-0 w-full">
            <OrbitalVisualizer
              satPositions={satPositions}
              telescopes={telescopes}
              selectedSatId={selectedSatId}
              selectedTelescopeId={selectedTelescopeId}
              onSelectSat={setSelectedSatId}
              onSelectTelescope={id => {
                const t = telescopes.find(x => x.telescope_id === id)
                if (t) handleTelescopeSelect(t)
              }}
              flyToTelescope={flyToTelescope}
              reflectingIds={reflectingIds}
              sunDirection={sunDirection}
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background/90 to-transparent px-3 pb-3 pt-8">
            <p className="font-mono text-[10px] text-muted-foreground">
              Cyan = telescopes · Amber = reflecting satellites · Cones show telescope look direction
            </p>
          </div>
        </Panel>

        {/* Step 3: nearby sats + interference events */}
        <div className="flex h-full min-h-0 flex-col gap-2">
          <Panel title="3. Nearby satellites" className="min-h-0 flex-1">
            <NearbyPanel
              telescopeId={selectedTelescopeId}
              selectedSatId={selectedSatId}
              onSelectSat={setSelectedSatId}
            />
          </Panel>

          <Panel
            title="Interference events"
            meta={scanning ? 'scanning…' : `${events.length}`}
            className="min-h-0 flex-1"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Specular reflections that could glare into the selected telescope.
              </p>
              <button
                type="button"
                disabled={!selectedTelescopeId || scanning}
                onClick={() => selectedTelescopeId && runScan(selectedTelescopeId)}
                className={cn(
                  'shrink-0 rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider',
                  scanning || !selectedTelescopeId
                    ? 'cursor-not-allowed border-border/50 text-muted-foreground'
                    : 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20',
                )}
              >
                {scanning ? 'Scanning…' : 'Scan now'}
              </button>
            </div>

            {events.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                No reflection events yet. Select a telescope and run a scan.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {events.slice(0, 12).map(ev => (
                  <li
                    key={ev.id}
                    className={cn(
                      'cursor-pointer rounded-sm border border-border/50 bg-muted/30 px-2 py-1.5 transition-colors hover:border-primary/40',
                      selectedSatId === ev.norad_id && 'border-hud-amber/60 bg-hud-amber/10',
                    )}
                    onClick={() => setSelectedSatId(ev.norad_id)}
                  >
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {new Date(ev.event_time).toUTCString().replace(' GMT', ' UTC')}
                    </div>
                    <div className="mt-0.5 text-xs text-foreground">
                      {satNameById.get(ev.norad_id) ?? `NORAD ${ev.norad_id}`}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-hud-amber">
                      Reflection
                      {ev.angle_deg != null ? ` · ${ev.angle_deg.toFixed(2)}°` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </main>
    </div>
  )
}
