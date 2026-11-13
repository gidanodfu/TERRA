const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseDateOnly(value) {
  if (typeof value !== 'string') return null
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day)
  if (year >= 0 && year < 100) date.setFullYear(year)
  date.setHours(0, 0, 0, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

export function formatDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDateDisplay(value) {
  const date = parseDateOnly(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function isValidDateOnly(value) {
  return parseDateOnly(value) !== null
}

export function isValidDateRange(from, to) {
  if (!from && !to) return true
  if (from && !isValidDateOnly(from)) return false
  if (to && !isValidDateOnly(to)) return false
  if (!from || !to) return true
  return parseDateOnly(from) <= parseDateOnly(to)
}

export function todayDateOnly() {
  return formatDateOnly(new Date())
}
