import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  EllipsisVertical,
  FileSpreadsheet,
  FlaskConical,
  LoaderCircle,
  MapPin,
  Mic,
  Paperclip,
  Phone,
  Radio,
  Send,
  Smile,
  Timer,
  TriangleAlert,
  Upload,
  Video,
  X,
  Zap,
} from 'lucide-react'
import { api } from '../api'
import {
  addDays,
  cx,
  formatIST,
  formatPhone,
  formatTime12,
  istNow,
  istToDate,
  relativeDayLabel,
  renderTemplate,
} from '../utils'

const DEFAULT_TEMPLATE = `Hi {name}! 🏡

We have just listed premium 2 & 3 BHK homes in *{area}*, Pune that match what you were looking for.

Would you like to schedule a site visit this weekend? Reply *YES* and our property advisor will call you.`

const SAMPLE_LEAD = { name: 'Rahul Deshmukh', area: 'Baner', phone: '919822011234' }
const MAX_MESSAGE_CHARS = 4096
const MAX_DELAY = { minutes: 43200, hours: 720 }
const PREVIEW_ROW_LIMIT = 200

const SCHEDULE_OPTIONS = [
  { id: 'now', title: 'Send Immediately', desc: 'Starts as soon as you confirm', icon: Zap },
  { id: 'delay', title: 'Send After Delay', desc: 'e.g. after 5 minutes', icon: Timer },
  { id: 'datetime', title: 'Specific Date & Time', desc: 'e.g. tomorrow at 10:00 AM IST', icon: CalendarClock },
]

/* -------------------------------------------------------------------------- */
/* Small building blocks                                                       */
/* -------------------------------------------------------------------------- */
function Section({ step, title, subtitle, children, aside }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            {step}
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Render WhatsApp-style *bold*, _italic_ and ~strike~ formatting. */
function WhatsAppText({ text }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g)
  return parts.map((part, i) => {
    if (/^\*[^*\n]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>
    if (/^_[^_\n]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>
    if (/^~[^~\n]+~$/.test(part)) return <s key={i}>{part.slice(1, -1)}</s>
    return <span key={i}>{part}</span>
  })
}

function WhatsAppPreview({ lead, message, isSample, index, total, onPrev, onNext, dayLabel, timeLabel }) {
  const initials = (lead.name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div>
      <div className="mx-auto w-full max-w-[340px] rounded-[2.6rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
        <div className="overflow-hidden rounded-[2rem] bg-white">
          {/* Status bar */}
          <div className="flex items-center justify-between bg-wa-teal px-5 pt-2 text-[10px] font-semibold text-white/90">
            <span>{timeLabel}</span>
            <span className="h-4 w-16 rounded-full bg-slate-900" />
            <span>5G ▮▮▮</span>
          </div>
          {/* Chat header */}
          <div className="flex items-center gap-2 bg-wa-teal px-2 pb-2.5 pt-2 text-white">
            <ArrowLeft className="h-5 w-5 shrink-0" />
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-sm font-bold text-emerald-900">
              {initials}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[15px] font-semibold">{lead.name || 'Lead'}</div>
              <div className="truncate text-[11px] text-white/80">{formatPhone(lead.phone)}</div>
            </div>
            <Video className="h-5 w-5 shrink-0" />
            <Phone className="h-[18px] w-[18px] shrink-0" />
            <EllipsisVertical className="h-5 w-5 shrink-0" />
          </div>
          {/* Messages */}
          <div className="wa-chat-bg flex h-[400px] flex-col overflow-y-auto px-3 py-3">
            <div className="mx-auto mb-3 rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
              {dayLabel}
            </div>
            <div className="mx-auto mb-3 max-w-[90%] rounded-md bg-amber-50 px-2.5 py-1.5 text-center text-[10.5px] leading-snug text-amber-800 shadow-sm">
              🔒 Messages are end-to-end encrypted. No one outside of this chat can read them.
            </div>
            {message ? (
              <div className="wa-bubble-out relative ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-wa-bubble px-2.5 pb-1.5 pt-1.5 text-[13.5px] leading-[1.35] text-slate-900 shadow-sm">
                <div className="whitespace-pre-wrap break-words">
                  <WhatsAppText text={message} />
                </div>
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-slate-500">
                  {timeLabel}
                  <CheckCheck className="h-3.5 w-3.5 text-wa-tick" />
                </div>
              </div>
            ) : (
              <p className="mt-10 text-center text-xs text-slate-500">Start typing a message to preview it here.</p>
            )}
          </div>
          {/* Input bar */}
          <div className="flex items-center gap-2 bg-wa-chat px-2 py-2">
            <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 text-slate-400">
              <Smile className="h-5 w-5" />
              <span className="flex-1 text-sm">Message</span>
              <Paperclip className="h-5 w-5" />
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wa-teal text-white">
              <Mic className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 text-xs text-slate-500">
        {isSample ? (
          <span>Sample preview — upload leads to see real recipients</span>
        ) : (
          <>
            <button
              type="button"
              onClick={onPrev}
              disabled={total < 2}
              className="rounded-md p-1 hover:bg-slate-200 disabled:opacity-30"
              aria-label="Previous lead"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              Previewing lead <strong className="text-slate-700">{index + 1}</strong> of {total}
            </span>
            <button
              type="button"
              onClick={onNext}
              disabled={total < 2}
              className="rounded-md p-1 hover:bg-slate-200 disabled:opacity-30"
              aria-label="Next lead"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */
export default function CampaignBuilder({ mode, tokenOverride, status, onCampaignCreated, onViewMonitor }) {
  // Upload
  const [parsed, setParsed] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  // Filters & message
  const [selectedAreas, setSelectedAreas] = useState([])
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)
  const textareaRef = useRef(null)

  // Schedule
  const [scheduleType, setScheduleType] = useState('now')
  const [delayValue, setDelayValue] = useState('5')
  const [delayUnit, setDelayUnit] = useState('minutes')
  const [schedDate, setSchedDate] = useState(() => addDays(istNow().date, 1))
  const [schedTime, setSchedTime] = useState('10:00')

  // Submit
  const [previewIndex, setPreviewIndex] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [created, setCreated] = useState(null)

  const selectedSet = useMemo(() => new Set(selectedAreas), [selectedAreas])
  const matchedLeads = useMemo(
    () => (parsed ? parsed.leads.filter((l) => l.valid && selectedSet.has(l.area)) : []),
    [parsed, selectedSet],
  )
  const skippedInSelection = useMemo(
    () => (parsed ? parsed.leads.filter((l) => !l.valid && selectedSet.has(l.area)).length : 0),
    [parsed, selectedSet],
  )

  const previewLead = matchedLeads.length ? matchedLeads[previewIndex % matchedLeads.length] : SAMPLE_LEAD
  const renderedMessage = renderTemplate(template, previewLead)

  /* ------------------------------ upload ------------------------------ */
  async function handleFile(file) {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'xlsx'].includes(ext)) {
      setUploadError('Unsupported file type. Please upload a .csv or .xlsx file.')
      return
    }
    setUploading(true)
    setUploadError(null)
    setCreated(null)
    try {
      const data = await api.parseLeads(file)
      setParsed(data)
      setSelectedAreas(data.area_counts.filter((a) => a.count > 0).map((a) => a.area))
      setPreviewIndex(0)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragActive(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  function clearUpload() {
    setParsed(null)
    setSelectedAreas([])
    setUploadError(null)
    setPreviewIndex(0)
    setConfirming(false)
  }

  /* ------------------------------ filters ------------------------------ */
  function toggleArea(area) {
    setPreviewIndex(0)
    setConfirming(false)
    setSelectedAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]))
  }

  /* ------------------------------ composer ------------------------------ */
  function insertVariable(token) {
    const el = textareaRef.current
    const start = el?.selectionStart ?? template.length
    const end = el?.selectionEnd ?? template.length
    setTemplate(template.slice(0, start) + token + template.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  /* ------------------------------ schedule ------------------------------ */
  const delayNumber = Number(delayValue)
  const delayValid = Number.isInteger(delayNumber) && delayNumber >= 1 && delayNumber <= MAX_DELAY[delayUnit]
  const scheduledInstant = istToDate(schedDate, schedTime)
  const datetimeValid = Boolean(scheduledInstant) && scheduledInstant.getTime() > Date.now() + 60_000

  let scheduleError = null
  let scheduleSummary = 'Immediately after you confirm'
  if (scheduleType === 'delay') {
    if (!delayValid) {
      scheduleError = `Enter a whole number between 1 and ${MAX_DELAY[delayUnit]} ${delayUnit}.`
    } else {
      const unitLabel = delayNumber === 1 ? delayUnit.slice(0, -1) : delayUnit
      const eta = new Date(Date.now() + delayNumber * (delayUnit === 'hours' ? 3600_000 : 60_000))
      scheduleSummary = `After ${delayNumber} ${unitLabel} (≈ ${formatIST(eta, { withDate: false })} IST)`
    }
  } else if (scheduleType === 'datetime') {
    if (!datetimeValid) {
      scheduleError = 'Choose a date and time at least 1 minute in the future (IST).'
    } else {
      scheduleSummary = `${relativeDayLabel(schedDate)} at ${formatTime12(schedTime)} IST`
    }
  }

  const today = istNow()
  const quickPicks = [
    { label: 'Today 6:00 PM', date: today.date, time: '18:00' },
    { label: 'Tomorrow 10:00 AM', date: addDays(today.date, 1), time: '10:00' },
    { label: 'Tomorrow 6:00 PM', date: addDays(today.date, 1), time: '18:00' },
  ].filter((p) => istToDate(p.date, p.time).getTime() > Date.now() + 60_000)

  /* ------------------------------ submit ------------------------------ */
  const trial = status?.trial
  const chatsLeft = trial ? trial.unique_chats_limit - trial.unique_chats_used : null
  const msgsLeft = trial ? trial.live_messages_limit - trial.live_messages_sent : null
  const liveOverLimit =
    mode === 'live' && trial && (matchedLeads.length > msgsLeft || matchedLeads.length > chatsLeft)
  const liveNoToken = mode === 'live' && status && !status.token_loaded && !tokenOverride

  const templateValid = template.trim().length > 0 && template.length <= MAX_MESSAGE_CHARS
  const canSubmit = matchedLeads.length > 0 && templateValid && !scheduleError && !submitting && !liveNoToken

  async function submit() {
    if (!canSubmit) return
    if (mode === 'live' && !confirming) {
      setConfirming(true)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await api.createCampaign({
        leads: matchedLeads.map(({ name, phone, area }) => ({ name, phone, area })),
        selected_areas: selectedAreas,
        message_template: template,
        schedule_type: scheduleType,
        delay_value: scheduleType === 'delay' ? delayNumber : null,
        delay_unit: delayUnit,
        scheduled_datetime: scheduleType === 'datetime' ? `${schedDate}T${schedTime}` : null,
        mode,
        whapi_token_override: tokenOverride || null,
      })
      setCreated(result)
      setConfirming(false)
      onCampaignCreated?.(result)
    } catch (err) {
      setSubmitError(err.message)
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  const submitLabel =
    scheduleType === 'now'
      ? mode === 'live'
        ? 'Send Campaign Now'
        : 'Send Demo Campaign Now'
      : mode === 'live'
        ? 'Schedule Campaign'
        : 'Schedule Demo Campaign'

  const previewDayLabel =
    scheduleType === 'datetime' && datetimeValid ? relativeDayLabel(schedDate) : 'Today'
  const previewTime =
    scheduleType === 'datetime' && datetimeValid ? formatTime12(schedTime) : formatIST(new Date(), { withDate: false })

  /* ------------------------------ render ------------------------------ */
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ============================ LEFT ============================ */}
      <div className="space-y-6">
        {/* 1. Upload */}
        <Section
          step={1}
          title="Upload lead list"
          subtitle="CSV or Excel (.xlsx) with Name, Phone and Area columns"
          aside={
            parsed && (
              <button
                type="button"
                onClick={clearUpload}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )
          }
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={cx(
              'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center transition',
              parsed ? 'py-4' : 'py-10',
              dragActive
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/40',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {uploading ? (
              <LoaderCircle className="h-8 w-8 animate-spin text-emerald-600" />
            ) : parsed ? (
              <div className="flex items-center gap-3 text-left">
                <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                <div>
                  <div className="font-medium text-slate-800">{parsed.filename}</div>
                  <div className="text-xs text-slate-500">
                    {parsed.total_rows} rows · {parsed.valid_count} valid
                    {parsed.invalid_count > 0 && ` · ${parsed.invalid_count} skipped`} — click or drop to replace
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="font-medium text-slate-700">
                  Drag & drop your lead file here, or <span className="text-emerald-600 underline">browse</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">.csv or .xlsx · up to 5 MB · try sample_leads.csv</p>
              </>
            )}
          </div>

          {uploadError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {uploadError}
            </div>
          )}

          {parsed && (
            <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Phone</th>
                    <th className="px-3 py-2 font-semibold">Area</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsed.leads.slice(0, PREVIEW_ROW_LIMIT).map((lead) => {
                    const inSelection = selectedSet.has(lead.area)
                    return (
                      <tr key={lead.row} className={cx(!inSelection && 'opacity-40', !lead.valid && 'bg-red-50/40')}>
                        <td className="px-3 py-2 tabular-nums text-slate-400">{lead.row}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{lead.name || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {lead.phone ? (
                            <span title={`Original: ${lead.phone_raw}`}>{lead.phone}</span>
                          ) : (
                            <span className="text-red-600">{lead.phone_raw || '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{lead.area}</td>
                        <td className="px-3 py-2">
                          {lead.valid ? (
                            <CircleCheck className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <span className="text-xs font-medium text-red-600">{lead.error}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {parsed.leads.length > PREVIEW_ROW_LIMIT && (
                <div className="bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
                  Showing first {PREVIEW_ROW_LIMIT} of {parsed.leads.length} rows
                </div>
              )}
            </div>
          )}
        </Section>

        {/* 2. Area filter */}
        <Section
          step={2}
          title="Filter by property area"
          subtitle="Choose which localities receive this campaign"
          aside={
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
                matchedLeads.length ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500',
              )}
            >
              {matchedLeads.length} matched lead{matchedLeads.length === 1 ? '' : 's'}
            </span>
          }
        >
          {parsed ? (
            <>
              <div className="flex flex-wrap gap-2">
                {parsed.area_counts.map(({ area, count }) => {
                  const active = selectedSet.has(area)
                  return (
                    <button
                      key={area}
                      type="button"
                      disabled={count === 0}
                      onClick={() => toggleArea(area)}
                      aria-pressed={active}
                      className={cx(
                        'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                        active
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400',
                      )}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      {area}
                      <span
                        className={cx(
                          'rounded-full px-1.5 text-xs tabular-nums',
                          active ? 'bg-white/20' : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <button
                  type="button"
                  className="font-medium text-emerald-700 hover:underline"
                  onClick={() => setSelectedAreas(parsed.area_counts.filter((a) => a.count > 0).map((a) => a.area))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="font-medium text-slate-500 hover:underline"
                  onClick={() => setSelectedAreas([])}
                >
                  Clear
                </button>
                {skippedInSelection > 0 && (
                  <span className="text-amber-700">
                    {skippedInSelection} row{skippedInSelection === 1 ? '' : 's'} in these areas skipped (invalid or
                    duplicate phone)
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Upload a lead file to see available areas.</p>
          )}
        </Section>

        {/* 3. Composer */}
        <Section
          step={3}
          title="Compose message"
          subtitle="Click a variable to insert it at the cursor — it's personalised for every lead"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {['{name}', '{area}'].map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertVariable(token)}
                className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 font-mono text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
              >
                + {token}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-400">
              Supports WhatsApp *bold*, _italic_, ~strike~
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={7}
            className="w-full resize-y rounded-xl border border-slate-300 px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="Hi {name}, new listings in {area}…"
          />
          <div className="mt-1 flex justify-between text-xs">
            <span className={cx(template.trim() ? 'text-slate-400' : 'text-red-600')}>
              {template.trim() ? 'Placeholders: {name}, {area}' : 'Message cannot be empty'}
            </span>
            <span className={cx('tabular-nums', template.length > MAX_MESSAGE_CHARS ? 'text-red-600' : 'text-slate-400')}>
              {template.length} / {MAX_MESSAGE_CHARS}
            </span>
          </div>
        </Section>

        {/* 4. Scheduler */}
        <Section step={4} title="Delivery schedule" subtitle="All times are India Standard Time (IST, UTC+05:30)">
          <div className="grid gap-3 sm:grid-cols-3">
            {SCHEDULE_OPTIONS.map(({ id, title, desc, icon: Icon }) => {
              const active = scheduleType === id
              return (
                <label
                  key={id}
                  className={cx(
                    'relative flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition',
                    active
                      ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100'
                      : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <input
                    type="radio"
                    name="schedule"
                    value={id}
                    checked={active}
                    onChange={() => setScheduleType(id)}
                    className="sr-only"
                  />
                  <Icon className={cx('h-5 w-5', active ? 'text-emerald-600' : 'text-slate-400')} />
                  <span className="text-sm font-semibold text-slate-800">{title}</span>
                  <span className="text-xs text-slate-500">{desc}</span>
                  {active && <CircleCheck className="absolute right-3 top-3 h-4 w-4 text-emerald-600" />}
                </label>
              )
            })}
          </div>

          {scheduleType === 'delay' && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-4">
              <span className="text-sm font-medium text-slate-700">Send after</span>
              <input
                type="number"
                min={1}
                max={MAX_DELAY[delayUnit]}
                step={1}
                value={delayValue}
                onChange={(e) => setDelayValue(e.target.value)}
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
                {['minutes', 'hours'].map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setDelayUnit(unit)}
                    className={cx(
                      'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition',
                      delayUnit === unit ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>
          )}

          {scheduleType === 'datetime' && (
            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Date</span>
                  <input
                    type="date"
                    value={schedDate}
                    min={today.date}
                    onChange={(e) => setSchedDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Time (IST)</span>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>
              {quickPicks.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {quickPicks.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setSchedDate(p.date)
                        setSchedTime(p.time)
                      }}
                      className={cx(
                        'rounded-full border px-3 py-1 text-xs font-medium transition',
                        schedDate === p.date && schedTime === p.time
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {scheduleError && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
              <CircleAlert className="h-4 w-4" /> {scheduleError}
            </p>
          )}
        </Section>
      </div>

      {/* ============================ RIGHT ============================ */}
      <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        <WhatsAppPreview
          lead={previewLead}
          message={renderedMessage}
          isSample={!matchedLeads.length}
          index={matchedLeads.length ? previewIndex % matchedLeads.length : 0}
          total={matchedLeads.length}
          onPrev={() => setPreviewIndex((i) => (i - 1 + matchedLeads.length) % matchedLeads.length)}
          onNext={() => setPreviewIndex((i) => (i + 1) % matchedLeads.length)}
          dayLabel={previewDayLabel}
          timeLabel={previewTime}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Recipients</dt>
              <dd className="font-semibold text-slate-800">{matchedLeads.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Areas</dt>
              <dd className="text-right font-medium text-slate-800">
                {selectedAreas.length ? selectedAreas.join(', ') : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Delivery</dt>
              <dd className="text-right font-medium text-slate-800">{scheduleError ? '—' : scheduleSummary}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Mode</dt>
              <dd>
                {mode === 'live' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    <Radio className="h-3 w-3" /> Live Whapi
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                    <FlaskConical className="h-3 w-3" /> Demo Simulation
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {liveNoToken && (
            <div className="mt-3 flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <CircleAlert className="h-4 w-4 shrink-0" />
              No Whapi token found. Add WHAPI_TOKEN to backend/.env or set a token override.
            </div>
          )}
          {liveOverLimit && (
            <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {matchedLeads.length} recipients may exceed your sandbox quota ({chatsLeft} new chats, {msgsLeft}{' '}
              messages left). Narrow the area filter or switch to Demo Simulation.
            </div>
          )}

          {confirming && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">Send real WhatsApp messages?</p>
              <p className="mt-1 text-xs">
                {matchedLeads.length} message{matchedLeads.length === 1 ? '' : 's'} will be delivered via channel{' '}
                {status?.channel_id} — {scheduleSummary.toLowerCase()}.
              </p>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="mt-2 text-xs font-medium text-red-700 underline"
              >
                Go back
              </button>
            </div>
          )}

          {submitError && (
            <div className="mt-3 flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <CircleAlert className="h-4 w-4 shrink-0" />
              {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={cx(
              'mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50',
              mode === 'live' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700',
            )}
          >
            {submitting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : scheduleType === 'now' ? (
              <Send className="h-4 w-4" />
            ) : (
              <CalendarClock className="h-4 w-4" />
            )}
            {confirming ? `Confirm — ${submitLabel}` : submitLabel}
          </button>
          {!matchedLeads.length && (
            <p className="mt-2 text-center text-xs text-slate-400">Upload leads and select at least one area.</p>
          )}
        </div>

        {created && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm">
            <div className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="flex-1">
                <p className="font-semibold">
                  Campaign #{created.id} {created.schedule_type === 'now' ? 'is sending' : 'scheduled'}
                </p>
                <p className="mt-0.5 text-xs text-emerald-800">
                  {created.total_count} lead{created.total_count === 1 ? '' : 's'} ·{' '}
                  {created.target_areas.join(', ')} · {created.scheduled_at_ist} ·{' '}
                  {created.mode === 'live' ? 'Live' : 'Demo'} mode
                </p>
                <button
                  type="button"
                  onClick={onViewMonitor}
                  className="mt-2 text-xs font-semibold text-emerald-700 underline"
                >
                  Track it in Campaign Monitor →
                </button>
              </div>
              <button type="button" onClick={() => setCreated(null)} aria-label="Dismiss">
                <X className="h-4 w-4 text-emerald-700" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
