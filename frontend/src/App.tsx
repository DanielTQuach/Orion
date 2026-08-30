import { useState, useMemo, useEffect } from 'react'
import { OrbitalVisualizer } from '@/components/OrbitalVisualizer'
import { Panel } from '@/components/dashboard-parts'
import TleStatusBanner from '@/components/TleStatusBanner'
import NearbyPanel from '@/components/NearbyPanel'
import { WorkflowSteps, type WorkflowPhase } from '@/components/workflow-steps'
import { cn } from '@/lib/utils'
import { useSatellites } from '@/hooks/useSatellites'
import { useTelescopes } from '@/hooks/useTelescopes'
import { useSatPositions } from '@/hooks/useSatPositions'
import { useFovCrossings } from '@/hooks/useFovCrossings'
import type { Telescope } from '@/hooks/useTelescopes'

interface SunDirection {
  x: number
  y: number
  z: number
}

const LOOKAHEAD_OPTIONS = [
  { hours: 1, label: '1h', hint: 'Next orbits' },
  { hours: 6, label: '6h', hint: 'Observing session' },
  { hours: 12, label: '12h', hint: 'Full night' },
  { hours: 24, label: '24h', hint: 'Next day' },
] as const

const DEFAULT_LOOKAHEAD_HOURS = 6
const DEMO_TELESCOPE_ID = 'DEMO'

export default function App() {
  const [selectedSatId, setSelectedSatId] = useState<number | null>(null)
  const [selectedTelescopeId, setSelectedTelescopeId] = useState<string | null>(null)
  const [flyToTelescope, setFlyToTelescope] = useState<Telescope | null>(null)
  const [lookaheadHours, setLookaheadHours] = useState<number>(DEFAULT_LOOKAHEAD_HOURS)
  const [scanning, setScanning] = useState(false)
  const [sunDirection, setSunDirection] = useState<SunDirection | null>(null)
  const [utcClock, setUtcClock] = useState(() => new Date())

  const { satellites } = useSatellites({})
  const { telescopes, loading: telescopesLoading } = useTelescopes()
  const noradIds = useMemo(() => satellites.map(s => s.norad_id), [satellites])
  const { positions: satPositions } = useSatPositions(noradIds)
  const { events, crossingIds, refetch: refetchCrossings } = useFovCrossings(selectedTelescopeId)

  const satNameById = useMemo(() => {
    const map = new Map<number, string>()
    satellites.forEach(s => map.set(s.norad_id, s.name))
    satPositions.forEach(p => map.set(p.norad_id, p.name))
    return map
  }, [satellites, satPositions])

  useEffect(() => {
    if (!selectedTelescopeId && telescopes.length > 0) {
      const demo = telescopes.find(t => t.telescope_id === DEMO_TELESCOPE_ID)
      const first = demo ?? telescopes[0]!
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

  useEffect(() => {
    const id = window.setInterval(() => setUtcClock(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const selectedTelescope = useMemo(
    () => telescopes.find(t => t.telescope_id === selectedTelescopeId) ?? null,
    [telescopes, selectedTelescopeId],
  )

  const upcomingEvents = useMemo(() => {
    const now = Date.now()
    const end = now + lookaheadHours * 3_600_000
    return events
      .filter(ev => {
        const t = new Date(ev.event_time).getTime()
        return t >= now - 15 * 60_000 && t <= end
      })
      .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())
  }, [events, lookaheadHours])

  const phase: WorkflowPhase = !selectedTelescope
    ? 1
    : upcomingEvents.length > 0
      ? 3
      : 2

  const runLookahead = async (telescopeId: string, hours: number = lookaheadHours) => {
    setScanning(true)
    try {
      await fetch('/api/fov/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telescope_id: telescopeId,
          hours_ahead: hours,
          step_seconds: hours <= 1 ? 30 : 60,
          fov_deg: telescopeId === DEMO_TELESCOPE_ID ? 3.0 : 2.0,
        }),
      })
      await refetchCrossings()
    } finally {
      setScanning(false)
    }
  }

  const handleTelescopeSelect = (telescope: Telescope) => {
    setSelectedTelescopeId(telescope.telescope_id)
    setSelectedSatId(null)
    setFlyToTelescope(telescope)
    runLookahead(telescope.telescope_id, lookaheadHours)
  }

  const utcLabel = utcClock.toISOString().slice(11, 19)

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-void text-foreground">
      <TleStatusBanner />

      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-panel/70 px-4 backdrop-blur-md md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-brass/40">
            <span className="text-sm font-semibold leading-none text-brass">O</span>
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-medium leading-none tracking-tight">Orion</p>
            <p className="hidden font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase sm:block">
              {selectedTelescope?.name ?? 'Pick a telescope'}
              <span className="text-white/20"> · </span>
              {utcLabel} UTC
            </p>
          </div>
        </div>
        <div className="md:hidden">
          <WorkflowSteps current={phase} compact />
        </div>
        <div className="hidden md:block">
          <WorkflowSteps current={phase} />
        </div>
        <p className="hidden font-mono text-[10px] tracking-wide text-muted-foreground uppercase xl:block">
          {satellites.length} sats · {telescopes.length} scopes
        </p>
      </header>

      <main className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[280px_1fr_320px]">
        <aside className="min-h-0 overflow-hidden border-b border-white/8 lg:border-r lg:border-b-0">
          <Panel
            step="Step 1"
            title="Telescopes"
            meta={`${telescopes.length}`}
            className="h-full rounded-none border-0"
            bodyClassName="p-2"
          >
            <p className="mb-2 px-1 text-xs text-muted-foreground">
              Pick one to check for satellite interference.
            </p>
            <div className="space-y-0.5">
              {telescopesLoading && (
                <p className="px-2 font-mono text-[11px] text-muted-foreground">Loading…</p>
              )}
              {telescopes.map(t => {
                const active = t.telescope_id === selectedTelescopeId
                const isDemo = t.telescope_id === DEMO_TELESCOPE_ID
                return (
                  <button
                    key={t.telescope_id}
                    type="button"
                    onClick={() => handleTelescopeSelect(t)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left transition-colors',
                      active
                        ? 'bg-brass/12 ring-1 ring-brass/35'
                        : 'hover:bg-white/4',
                      isDemo && !active && 'ring-1 ring-cyan/20',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium tracking-tight">{t.name}</span>
                      {isDemo ? (
                        <span className="rounded-sm border border-cyan/30 bg-cyan/10 px-1.5 py-0.5 font-mono text-[9px] text-cyan uppercase">
                          Demo
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] text-muted-foreground uppercase">
                          {t.telescope_id}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {t.lat.toFixed(2)}°, {t.lon.toFixed(2)}°
                    </p>
                    {isDemo && (
                      <p className="mt-1 text-[10px] text-cyan/80">
                        Guaranteed FOV predictions
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          </Panel>
        </aside>

        <section className="relative min-h-[42vh] overflow-hidden lg:min-h-0">
          <div className="absolute inset-0">
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
              reflectingIds={crossingIds}
              sunDirection={sunDirection}
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-3 lg:p-4">
            <div className="rounded-full border border-white/10 bg-panel/75 px-3 py-1.5 backdrop-blur-md">
              <p className="font-mono text-[10px] text-muted-foreground">
                {selectedTelescope
                  ? `${upcomingEvents.length} crossings in ${lookaheadHours}h window`
                  : 'Select a telescope to begin'}
              </p>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-void/90 to-transparent px-3 pb-3 pt-8">
            <p className="font-mono text-[10px] text-muted-foreground">
              Cyan = telescopes · Amber = FOV crossings · Cones show look direction
            </p>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-0 overflow-hidden border-t border-white/8 lg:border-t-0 lg:border-l">
          <Panel
            step="Step 2"
            title="Nearby satellites"
            className="min-h-0 flex-1 rounded-none border-0 border-b border-white/8"
            bodyClassName="p-2"
          >
            <NearbyPanel
              telescopeId={selectedTelescopeId}
              selectedSatId={selectedSatId}
              onSelectSat={setSelectedSatId}
            />
          </Panel>

          <Panel
            step="Step 3"
            title="Look ahead"
            meta={scanning ? 'scanning…' : `${upcomingEvents.length} in window`}
            className="min-h-0 flex-1 rounded-none border-0"
            bodyClassName="p-3"
          >
            <p className="mb-3 text-xs text-muted-foreground">
              Predict when satellite trails may cross this telescope’s field of view during a long exposure.
            </p>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {LOOKAHEAD_OPTIONS.map(opt => {
                const active = lookaheadHours === opt.hours
                return (
                  <button
                    key={opt.hours}
                    type="button"
                    disabled={scanning}
                    title={opt.hint}
                    onClick={() => setLookaheadHours(opt.hours)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 font-mono text-[10px] tracking-wide uppercase transition-colors',
                      active
                        ? 'border-cyan/45 bg-cyan/15 text-cyan'
                        : 'border-white/12 text-muted-foreground hover:border-white/20 hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              disabled={!selectedTelescopeId || scanning}
              onClick={() => selectedTelescopeId && runLookahead(selectedTelescopeId)}
              className={cn(
                'mb-3 w-full rounded-lg px-3 py-2.5 font-mono text-[11px] font-semibold tracking-wide uppercase transition-colors',
                scanning || !selectedTelescopeId
                  ? 'cursor-not-allowed border border-white/10 bg-white/5 text-muted-foreground'
                  : 'predict-glow border border-cyan/30 bg-cyan text-void hover:bg-cyan/90',
              )}
            >
              {scanning
                ? `Scanning next ${lookaheadHours}h…`
                : `Predict next ${lookaheadHours}h`}
            </button>

            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No interference events in the next {lookaheadHours}h. Run a prediction to scan.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {upcomingEvents.slice(0, 12).map(ev => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSatId(ev.norad_id)}
                      className={cn(
                        'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                        selectedSatId === ev.norad_id
                          ? 'bg-cyan/12 ring-1 ring-cyan/35'
                          : 'hover:bg-white/4',
                      )}
                    >
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {new Date(ev.event_time).toUTCString().replace(' GMT', ' UTC')}
                      </div>
                      <div className="mt-0.5 text-sm font-medium tracking-tight text-foreground">
                        {satNameById.get(ev.norad_id) ?? `NORAD ${ev.norad_id}`}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-cyan">
                        Trail in FOV
                        {ev.separation_deg != null
                          ? ` · ${ev.separation_deg.toFixed(2)}° from boresight`
                          : ''}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </main>
    </div>
  )
}
