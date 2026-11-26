import { useCallback, useEffect, useState } from 'react'
import { Activity, Send } from 'lucide-react'
import { api } from './api'
import { cx } from './utils'
import TopStatusBar from './components/TopStatusBar'
import CampaignBuilder from './components/CampaignBuilder'
import CampaignMonitor from './components/CampaignMonitor'

const STATUS_REFRESH_MS = 15000

const TABS = [
  { id: 'builder', label: 'Create & Schedule Campaign', icon: Send },
  { id: 'monitor', label: 'Campaign Monitor & Logs', icon: Activity },
]

export default function App() {
  const [mode, setMode] = useState(() => localStorage.getItem('realtyreach.mode') || 'demo')
  const [tokenOverride, setTokenOverride] = useState('') // memory only, never persisted
  const [status, setStatus] = useState(null)
  const [statusError, setStatusError] = useState(null)
  const [tab, setTab] = useState('builder')
  const [monitorVersion, setMonitorVersion] = useState(0)

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.getStatus())
      setStatusError(null)
    } catch (err) {
      setStatusError(err.message)
    }
  }, [])

  useEffect(() => {
    refreshStatus()
    const timer = setInterval(refreshStatus, STATUS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refreshStatus])

  useEffect(() => {
    localStorage.setItem('realtyreach.mode', mode)
  }, [mode])

  const handleCampaignCreated = useCallback(() => {
    setMonitorVersion((v) => v + 1)
    refreshStatus()
  }, [refreshStatus])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <TopStatusBar
        status={status}
        statusError={statusError}
        mode={mode}
        onModeChange={setMode}
        tokenOverride={tokenOverride}
        onTokenOverrideChange={setTokenOverride}
        onRefresh={refreshStatus}
      />

      <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <nav className="mt-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:inline-flex">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cx(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition sm:flex-none',
                tab === id ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        {/* Both tabs stay mounted so uploaded leads and drafts survive tab switches. */}
        <div className={cx('mt-6', tab !== 'builder' && 'hidden')}>
          <CampaignBuilder
            mode={mode}
            tokenOverride={tokenOverride}
            status={status}
            onCampaignCreated={handleCampaignCreated}
            onViewMonitor={() => setTab('monitor')}
          />
        </div>
        <div className={cx('mt-6', tab !== 'monitor' && 'hidden')}>
          <CampaignMonitor active={tab === 'monitor'} version={monitorVersion} onActivity={refreshStatus} />
        </div>
      </main>
    </div>
  )
}
