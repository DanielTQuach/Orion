import { useState } from 'react'

interface Telescope {
  telescope_id: string
  name: string
  lat: number
  lon: number
  alt_m: number
  operator: string | null
}

export default function TelescopeSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Telescope[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/telescopes?search=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setResults(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.panel}>
      <h2 style={styles.title}>Telescope Lookup</h2>
      <div style={styles.row}>
        <input
          style={styles.input}
          placeholder="Search by ID or name..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button style={styles.button} onClick={search} disabled={loading}>
          {loading ? '...' : 'Search'}
        </button>
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <ul style={styles.list}>
        {results.map(t => (
          <li key={t.telescope_id} style={styles.item}>
            <strong>{t.telescope_id}</strong> — {t.name}
            <br />
            <small>
              {t.lat.toFixed(4)}°, {t.lon.toFixed(4)}° | {t.alt_m}m
              {t.operator ? ` | ${t.operator}` : ''}
            </small>
          </li>
        ))}
        {results.length === 0 && !loading && query && (
          <li style={styles.muted}>No telescopes found.</li>
        )}
      </ul>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 320,
    background: 'rgba(15,20,30,0.88)',
    border: '1px solid #2a3a4a',
    borderRadius: 8,
    padding: 16,
    zIndex: 100,
    color: '#e0e8f0',
    fontFamily: 'system-ui, sans-serif',
  },
  title: { margin: '0 0 12px', fontSize: 15, fontWeight: 600 },
  row: { display: 'flex', gap: 8 },
  input: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 4,
    border: '1px solid #2a3a4a',
    background: '#0d1520',
    color: '#e0e8f0',
    fontSize: 13,
  },
  button: {
    padding: '6px 14px',
    borderRadius: 4,
    border: 'none',
    background: '#3b82d4',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  list: { listStyle: 'none', padding: 0, margin: '12px 0 0', maxHeight: 260, overflowY: 'auto' },
  item: { padding: '8px 0', borderBottom: '1px solid #1a2a3a', fontSize: 13, lineHeight: 1.5 },
  muted: { color: '#57606a', fontSize: 13, padding: '8px 0' },
  error: { color: '#f87171', fontSize: 12, margin: '8px 0 0' },
}
