const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
const plain = new Intl.NumberFormat('en-US')

/** $1,234.56 — or an em dash when there's no value. */
export function formatMoney(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : usd.format(value)
}

/** $1,235 for headline numbers where cents are noise. */
export function formatMoneyWhole(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : usdWhole.format(value)
}

/** $9.8K for chart axes. */
export function formatMoneyCompact(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : usdCompact.format(value)
}

/** +$12.30 / −$4.00 with a real minus sign. */
export function formatDelta(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : '−'}${usd.format(Math.abs(value))}`
}

/** +12.3% / −4.0% */
export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}%`
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? '—' : plain.format(value)
}

export function formatPieces(count: number | null | undefined): string {
  return count == null ? '—' : `${plain.format(count)} pcs`
}

/** SQLite "YYYY-MM-DD HH:MM:SS" (UTC) or ISO → Date. */
export function parseStamp(stamp: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp) ? `${stamp.replace(' ', 'T')}Z` : stamp)
}

export function formatDate(stamp: string | null | undefined): string {
  if (!stamp) return '—'
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(parseStamp(stamp))
}

export function formatShortDate(stamp: string | null | undefined): string {
  if (!stamp) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parseStamp(stamp))
}

/** "just now", "5 min ago", "yesterday", "3 days ago", or a date. */
export function formatAgo(stamp: string | null | undefined, now = Date.now()): string {
  if (!stamp) return 'never'
  const ms = now - parseStamp(stamp).getTime()
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(stamp)
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${plain.format(n)} ${n === 1 ? one : many}`
}
