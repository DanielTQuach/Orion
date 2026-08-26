import Globe from '@/components/Globe'
import TelescopeSearch from '@/components/TelescopeSearch'
import './App.css'

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'relative' }}>
      <Globe />
      <TelescopeSearch />
    </div>
  )
}
