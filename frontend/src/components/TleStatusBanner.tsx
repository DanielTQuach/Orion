/**
 * TLE status banner — shown at the top when the cache is empty.
 * Lets the user seed static fallback TLEs with one click.
 */
import { useEffect, useState } from 'react'

export default function TleStatusBanner() {
  const [count, setCount] = useState<number | null>(null)
  const [seeding, setSeeding] = useState(false)

  const checkStatus = () =>
    fetch('/api/tle/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setCount(d.cached_tle_count))
      .catch(() => {})

  useEffect(() => {
    checkStatus()
    const t = setInterval(checkStatus, 15_000)
    return () => clearInterval(t)
  }, [])

  const seedFallback = async () => {
    setSeeding(true)
    await fetch('/api/tle/seed', { method: 'POST' }).catch(() => {})
    await checkStatus()
    setSeeding(false)
  }

  // Don't render if cache is populated or status unknown
  if (count === null || count > 0) return null

  return (
    <div style={styles.banner}>
      <span style={styles.icon}>⚠</span>
      <span>
        No satellite TLEs in cache — CelesTrak may be unreachable.
        Satellite positions will not display.
      </span>
      <button style={styles.btn} onClick={seedFallback} disabled={seeding}>
        {seeding ? 'Loading…' : 'Load demo TLEs'}
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: 'relative',
    flexShrink: 0,
    background: '#78350f',
    borderBottom: '1px solid #92400e',
    color: '#fef3c7',
    fontSize: 13,
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    zIndex: 200,
    fontFamily: 'system-ui, sans-serif',
  },
  icon:  { fontSize: 16, flexShrink: 0 },
  btn: {
    marginLeft: 'auto',
    padding: '4px 14px',
    borderRadius: 4,
    border: 'none',
    background: '#d97706',
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
}
