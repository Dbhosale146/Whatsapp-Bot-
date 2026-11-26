import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  Ban,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  FlaskConical,
  Inbox,
  LoaderCircle,
  Radio,
  RefreshCw,
} from 'lucide-react'
import { api } from '../api'
import { cx, formatIST, formatPhone } from '../utils'

const POLL_INTERVAL_MS = 5000
const ACTIVE_STATUSES = new Set(['Scheduled', 'Running'])

const STATUS_STYLES = {
  Scheduled: { cls: 'bg-sky-50 text-sky-700 ring-sky-200', icon: Clock },
  Running: { cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: LoaderCircle, spin: true },
  Completed: { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CircleCheck },
  Cancelled: { cls: 'bg-slate-100 text-slate-500 ring-slate-200', icon: Ban },
}

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.Cancelled
  const Icon = style.icon
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', style.cls)}>
      <Icon className={cx('h-3.5 w-3.5', style.spin && 'animate-spin')} />
      {status}
    </span>
  )
}

function ModeBadge({ mode }) {
  return mode === 'live' ? (
    <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
      <Radio className="h-3 w-3" /> Live
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700">
      <FlaskConical className="h-3 w-3" /> Demo
    </span>
  )
}

function Progress({ sent, failed, total }) {
  const done = sent + failed
  const pct = (n) => (total ? `${(n / total) * 100}%` : '0%')
  return (
    <div className="min-w-[9rem]">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="bg-emerald-500 transition-all" style={{ width: pct(sent) }} />
        <div className="bg-red-500 transition-all" style={{ width: pct(failed) }} />
      </div>
      <div className="mt-1 flex gap-2 text-xs tabular-nums text-slate-500">
        <span className="text-emerald-700">{sent} sent</span>
        {failed > 0 && <span className="text-red-600">{failed} failed</span>}
        <span className="ml-auto">
          {done}/{total}
        </span>
      </div>
    </div>
  )
}

function prettyResponse(raw) {
  if (!raw) return '—'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function DeliveryLog({ entry, campaign }) {
  if (!entry || (entry.loading && !entry.data)) {
    return (
      <div className="flex items-center gap-2 px-6 py-6 text-sm text-slate-500">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Loading delivery log…
      </div>
    )
  }
  if (entry.error) {
    return <div className="px-6 py-4 text-sm text-red-600">{entry.error}</div>
  }

  const logs = entry.data.logs
  if (!logs.length) {
    return (
      <div className="px-6 py-6 text-sm text-slate-500">
        {campaign.status === 'Scheduled'
          ? `Nothing sent yet — delivery starts ${campaign.scheduled_at_ist}.`
          : campaign.status === 'Cancelled'
            ? 'This campaign was cancelled before any messages were sent.'
            : 'Waiting for the first message…'}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-6 py-2 font-semibold">Recipient</th>
            <th className="px-3 py-2 font-semibold">Phone</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Timestamp (IST)</th>
            <th className="px-3 py-2 font-semibold">Whapi Response</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {logs.map((log) => (
            <tr key={log.id} className="align-top">
              <td className="px-6 py-2.5">
                <div className="font-medium text-slate-800">{log.name || '—'}</div>
                <div className="text-xs text-slate-400">{log.area}</div>
              </td>
              <td className="px-3 py-2.5 font-mono text-xs">{formatPhone(log.phone)}</td>
              <td className="px-3 py-2.5">
                {log.status === 'Delivered' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CircleCheck className="h-4 w-4" /> Delivered
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                    <CircleX className="h-4 w-4" /> Failed
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                {formatIST(log.created_at, { withSeconds: true })}
              </td>
              <td className="max-w-md px-3 py-2.5">
                <details className="group">
                  <summary className="cursor-pointer truncate font-mono text-xs text-slate-500 hover:text-slate-800">
                    {log.response || '—'}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">
                      {prettyResponse(log.response)}
                    </pre>
                    <div className="rounded-lg bg-wa-bubble px-3 py-2 text-xs whitespace-pre-wrap text-slate-800">
                      {log.message}
                    </div>
                  </div>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CampaignMonitor({ active, version, onActivity }) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [logs, setLogs] = useState({})
  const [cancellingId, setCancellingId] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const expandedRef = useRef(expandedId)
  useEffect(() => {
    expandedRef.current = expandedId
  }, [expandedId])

  const loadLogs = useCallback(async (id) => {
    setLogs((prev) => ({ ...prev, [id]: { ...prev[id], loading: true } }))
    try {
      const data = await api.getLogs(id)
      setLogs((prev) => ({ ...prev, [id]: { data, loading: false, error: null } }))
    } catch (err) {
      setLogs((prev) => ({ ...prev, [id]: { ...prev[id], loading: false, error: err.message } }))
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await api.listCampaigns()
      setCampaigns(data)
      setError(null)
      setLastUpdated(new Date())
      if (expandedRef.current != null) loadLogs(expandedRef.current)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [loadLogs])

  // Load when the tab becomes visible or a new campaign is created.
  useEffect(() => {
    if (active) refresh()
  }, [active, version, refresh])

  // Auto-poll every 5s while any campaign is pending or in progress.
  const hasActive = campaigns.some((c) => ACTIVE_STATUSES.has(c.status))
  useEffect(() => {
    if (!active || !hasActive) return
    const timer = setInterval(() => {
      refresh()
      onActivity?.()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [active, hasActive, refresh, onActivity])

  function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    loadLogs(id)
  }

  async function cancel(campaign) {
    if (!window.confirm(`Cancel campaign #${campaign.id}? Scheduled messages will not be sent.`)) return
    setCancellingId(campaign.id)
    try {
      await api.cancelCampaign(campaign.id)
      await refresh()
    } catch (err) {
      window.alert(err.message)
      await refresh()
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="font-semibold text-slate-900">Campaigns</h2>
          <p className="text-sm text-slate-500">
            {hasActive ? 'Auto-refreshing every 5 seconds while campaigns are active' : 'All campaigns are idle'}
            {lastUpdated && ` · updated ${formatIST(lastUpdated, { withDate: false, withSeconds: true })}`}
          </p>
        </div>
        {hasActive && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
        )}
        <button
          type="button"
          onClick={refresh}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 px-6 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <LoaderCircle className="h-5 w-5 animate-spin" /> Loading campaigns…
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
          <Inbox className="h-10 w-10 text-slate-300" />
          <p className="text-sm">No campaigns yet. Create one in the first tab.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-3" />
                <th className="px-3 py-3 font-semibold">Campaign</th>
                <th className="px-3 py-3 font-semibold">Target Areas</th>
                <th className="px-3 py-3 font-semibold">Scheduled (IST)</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Progress</th>
                <th className="px-3 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((c) => {
                const expanded = expandedId === c.id
                return (
                  <Fragment key={c.id}>
                    <tr
                      className={cx('cursor-pointer transition hover:bg-slate-50', expanded && 'bg-slate-50')}
                      onClick={() => toggleExpand(c.id)}
                    >
                      <td className="px-3 py-3 text-slate-400">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">#{c.id}</span>
                          <ModeBadge mode={c.mode} />
                        </div>
                        <div className="mt-0.5 max-w-[16rem] truncate text-xs text-slate-400" title={c.message_template}>
                          {c.message_template}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-[14rem] flex-wrap gap-1">
                          {c.target_areas.map((a) => (
                            <span key={a} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {a}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                        {formatIST(c.scheduled_at)}
                        <div className="text-slate-400">
                          {c.schedule_type === 'now' ? 'Immediate' : c.schedule_type === 'delay' ? 'Delayed' : 'Date & time'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={c.status} />
                        {c.error && <div className="mt-1 max-w-[12rem] text-xs text-red-600">{c.error}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <Progress sent={c.sent_count} failed={c.failed_count} total={c.total_count} />
                      </td>
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {c.status === 'Scheduled' ? (
                          <button
                            type="button"
                            onClick={() => cancel(c)}
                            disabled={cancellingId === c.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {cancellingId === c.id ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Ban className="h-3.5 w-3.5" />
                            )}
                            Cancel
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50/60 p-0">
                          <div className="border-l-4 border-emerald-500">
                            <DeliveryLog entry={logs[c.id]} campaign={c} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
