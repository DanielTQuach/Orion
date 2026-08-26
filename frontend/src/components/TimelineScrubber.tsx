/**
 * Timeline scrubber — shows reflection event tick marks and lets the user
 * scrub through a 24-hour window to see which satellites were reflecting.
 *
 * Events are binned by hour and displayed as tick marks on the bar.
 * The scrubbed time is passed up so the globe can highlight active events.
 */
import { useMemo, useState, useCallback } from 'react'
import type { ReflectionEvent } from '@/hooks/useReflections'

interface Props {
  events: ReflectionEvent[]
  onTimeChange?: (isoTime: string | null) => void
  telescopeId: string | null
  onPredict?: () => void
  predicting?: boolean
}

const WINDOW_HOURS = 24

export default function TimelineScrubber({
  events,
  onTimeChange,
  telescopeId,
  onPredict,
  predicting,
}: Props) {
  const [scrubHour, setScrubHour] = useState<number | null>(null)

  // Compute tick positions — one per unique hour bucket
  const ticks = useMemo(() => {
    const now = Date.now()
    const buckets = new Set<number>()
    events.forEach(e => {
      const t = new Date(e.event_time).getTime()
      const hoursFromNow = (t - now) / 3_600_000
      if (hoursFromNow >= -1 && hoursFromNow <= WINDOW_HOURS) {
        buckets.add(Math.round(hoursFromNow))
      }
    })
    return Array.from(buckets).sort((a, b) => a - b)
  }, [events])

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const h = Number(e.target.value)
      setScrubHour(h)
      if (onTimeChange) {
        const t = new Date(Date.now() + h * 3_600_000)
        onTimeChange(t.toISOString())
      }
    },
    [onTimeChange]
  )

  const clearScrub = () => {
    setScrubHour(null)
    onTimeChange?.(null)
  }

  if (!telescopeId) return null

  const scrubLabel = scrubHour === null
    ? 'Now'
    : scrubHour === 0
      ? 'Now'
      : scrubHour > 0
        ? `+${scrubHour}h`
        : `${scrubHour}h`

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Timeline — {telescopeId}</span>
        <div style={styles.headerRight}>
          <span style={styles.eventCount}>{events.length} event{events.length !== 1 ? 's' : ''}</span>
          <button
            style={{ ...styles.btn, ...(predicting ? styles.btnDisabled : {}) }}
            onClick={onPredict}
            disabled={predicting}
          >
            {predicting ? 'Scanning…' : '⟳ Predict 24h'}
          </button>
          {scrubHour !== null && (
            <button style={styles.btnGhost} onClick={clearScrub}>Back to now</button>
          )}
        </div>
      </div>

      {/* Scrubber bar */}
      <div style={styles.barWrap}>
        {/* Hour labels */}
        <div style={styles.labels}>
          {[0, 6, 12, 18, 24].map(h => (
            <span key={h} style={{ ...styles.label, left: `${(h / WINDOW_HOURS) * 100}%` }}>
              {h === 0 ? 'Now' : `+${h}h`}
            </span>
          ))}
        </div>

        {/* Tick marks for reflection events */}
        <div style={styles.tickRow}>
          {ticks.map(h => (
            <div
              key={h}
              style={{
                ...styles.tick,
                left: `${Math.max(0, Math.min(100, ((h) / WINDOW_HOURS) * 100))}%`,
              }}
              title={`Reflection event at +${h}h`}
            />
          ))}
        </div>

        {/* Scrub input */}
        <input
          type="range"
          min={0}
          max={WINDOW_HOURS}
          step={1}
          value={scrubHour ?? 0}
          onChange={handleScrub}
          style={styles.range}
        />
      </div>

      <div style={styles.timeLabel}>
        {scrubHour === null || scrubHour === 0
          ? new Date().toUTCString()
          : new Date(Date.now() + (scrubHour ?? 0) * 3_600_000).toUTCString()}
        {' '}
        <span style={{ color: '#3b82d4' }}>{scrubLabel}</span>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 660,
    background: 'rgba(15,20,30,0.92)',
    border: '1px solid #2a3a4a',
    borderRadius: 8,
    padding: '12px 16px',
    zIndex: 100,
    color: '#e0e8f0',
    fontFamily: 'system-ui, sans-serif',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerRight: { display: 'flex', gap: 10, alignItems: 'center' },
  title:      { fontSize: 13, fontWeight: 600 },
  eventCount: { fontSize: 12, color: '#8ba0b4' },
  btn: {
    padding: '4px 12px',
    borderRadius: 4,
    border: 'none',
    background: '#3b82d4',
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
  },
  btnDisabled: { background: '#2a3a4a', cursor: 'not-allowed' },
  btnGhost: {
    padding: '4px 10px',
    borderRadius: 4,
    border: '1px solid #2a3a4a',
    background: 'transparent',
    color: '#8ba0b4',
    fontSize: 12,
    cursor: 'pointer',
  },
  barWrap:  { position: 'relative', height: 48, marginBottom: 4 },
  labels:   { position: 'relative', height: 16, marginBottom: 2 },
  label: {
    position: 'absolute',
    transform: 'translateX(-50%)',
    fontSize: 10,
    color: '#8ba0b4',
  },
  tickRow:  { position: 'relative', height: 10, marginBottom: 2 },
  tick: {
    position: 'absolute',
    width: 2,
    height: 10,
    background: '#ef4444',
    borderRadius: 1,
    transform: 'translateX(-50%)',
  },
  range: {
    width: '100%',
    accentColor: '#3b82d4',
    cursor: 'pointer',
  },
  timeLabel: { fontSize: 11, color: '#8ba0b4', textAlign: 'center' as const },
}
