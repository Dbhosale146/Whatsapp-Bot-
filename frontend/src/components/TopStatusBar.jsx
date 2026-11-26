import { useState } from 'react'
import {
  CircleAlert,
  CircleCheck,
  FlaskConical,
  KeyRound,
  MessageCircle,
  Phone,
  Radio,
  RefreshCw,
  Smartphone,
  X,
} from 'lucide-react'
import { cx } from '../utils'

function Meter({ label, used, limit }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const tone = pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="min-w-[8.5rem]">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold tabular-nums text-slate-800">
          {used} / {limit}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={cx('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" />
      </div>
      <div className="leading-tight">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className="font-mono text-sm font-semibold text-slate-800">{value}</div>
      </div>
    </div>
  )
}

export default function TopStatusBar({
  status,
  statusError,
  mode,
  onModeChange,
  tokenOverride,
  onTokenOverrideChange,
  onRefresh,
}) {
  const [showOverride, setShowOverride] = useState(false)
  const trial = status?.trial
  const offline = Boolean(statusError) && !status

  let tokenBadge
  if (tokenOverride) {
    tokenBadge = { text: 'Override', cls: 'bg-sky-50 text-sky-700 ring-sky-200', icon: KeyRound }
  } else if (status?.token_loaded) {
    tokenBadge = { text: 'Loaded', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CircleCheck }
  } else {
    tokenBadge = { text: status ? 'Missing' : '—', cls: 'bg-red-50 text-red-700 ring-red-200', icon: CircleAlert }
  }
  const TokenIcon = tokenBadge.icon

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold text-slate-900">RealtyReach</div>
            <div className="text-xs text-slate-500">WhatsApp lead campaigns · Pune</div>
          </div>
        </div>

        <div className="hidden h-8 w-px bg-slate-200 lg:block" />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <InfoItem icon={Smartphone} label="Whapi Channel" value={status?.channel_id ?? '—'} />
          <InfoItem icon={Phone} label="Sender" value={status?.sender_number ?? '—'} />
          <div className="leading-tight">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">.env Token</div>
            <span
              className={cx(
                'mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1',
                tokenBadge.cls,
              )}
            >
              <TokenIcon className="h-3.5 w-3.5" />
              {tokenBadge.text}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
            Trial
            <br />
            Sandbox
          </div>
          <Meter label="Unique Chats" used={trial?.unique_chats_used ?? 0} limit={trial?.unique_chats_limit ?? 5} />
          <Meter label="Msgs" used={trial?.live_messages_sent ?? 0} limit={trial?.live_messages_limit ?? 150} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Delivery mode"
            className="flex rounded-xl border border-slate-200 bg-slate-100 p-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'demo'}
              onClick={() => onModeChange('demo')}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                mode === 'demo' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <FlaskConical className="h-4 w-4" />
              Demo Simulation
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'live'}
              onClick={() => onModeChange('live')}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                mode === 'live' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <Radio className={cx('h-4 w-4', mode === 'live' && 'animate-pulse')} />
              Live Whapi Sandbox
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowOverride((v) => !v)}
            title="Override Whapi token for this session"
            className={cx(
              'rounded-lg border p-2 transition',
              showOverride || tokenOverride
                ? 'border-sky-300 bg-sky-50 text-sky-700'
                : 'border-slate-200 text-slate-500 hover:bg-slate-100',
            )}
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh status"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showOverride && (
        <div className="border-t border-slate-200 bg-sky-50/60">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            <KeyRound className="h-4 w-4 text-sky-600" />
            <label htmlFor="token-override" className="text-sm font-medium text-sky-900">
              Token override
            </label>
            <input
              id="token-override"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={tokenOverride}
              onChange={(e) => onTokenOverrideChange(e.target.value.trim())}
              placeholder="Optional — leave blank to use WHAPI_TOKEN from backend/.env"
              className="min-w-[18rem] flex-1 rounded-lg border border-sky-200 bg-white px-3 py-1.5 font-mono text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            {tokenOverride && (
              <button
                type="button"
                onClick={() => onTokenOverrideChange('')}
                className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
            <span className="text-xs text-sky-700">Kept in this browser tab’s memory only; never saved.</span>
          </div>
        </div>
      )}

      {mode === 'live' && (
        <div className="bg-red-600 px-4 py-1.5 text-center text-xs font-medium text-white">
          Live mode: campaigns send real WhatsApp messages from {status?.sender_number ?? 'your Whapi channel'} and
          use your trial quota (5 unique chats · 150 messages).
        </div>
      )}
      {offline && (
        <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
          {statusError}
        </div>
      )}
    </header>
  )
}
