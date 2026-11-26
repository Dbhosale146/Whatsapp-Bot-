export const IST_TZ = 'Asia/Kolkata'

/** Current date/time in IST as { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
export function istNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: IST_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Convert an IST wall-clock date + time into a real Date instant. */
export function istToDate(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  const dt = new Date(`${dateStr}T${timeStr}:00+05:30`)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function formatIST(value, { withDate = true, withSeconds = false } = {}) {
  if (!value) return '—'
  const dt = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    ...(withDate ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  }).format(dt)
}

/** 'Today', 'Tomorrow' or a formatted date for an IST date string. */
export function relativeDayLabel(dateStr) {
  const today = istNow().date
  if (dateStr === today) return 'Today'
  if (dateStr === addDays(today, 1)) return 'Tomorrow'
  const dt = istToDate(dateStr, '12:00')
  return dt
    ? new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(dt)
    : dateStr
}

export function formatTime12(timeStr) {
  const dt = istToDate('2000-01-01', timeStr)
  return dt ? formatIST(dt, { withDate: false }) : timeStr
}

export function renderTemplate(template, lead) {
  return template
    .replace(/\{\s*name\s*\}/gi, (lead?.name || '').trim() || 'there')
    .replace(/\{\s*area\s*\}/gi, (lead?.area || '').trim())
    .trim()
}

export function formatPhone(digits) {
  if (!digits) return ''
  if (/^91\d{10}$/.test(digits)) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
  return digits
}

export const cx = (...classes) => classes.filter(Boolean).join(' ')
