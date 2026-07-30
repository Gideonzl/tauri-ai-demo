/**
 * Small, dependency-free five-field Cron matcher for the in-app scheduler.
 * Supports wildcards, numbers, ranges, comma lists and step expressions.
 */
const RANGES: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]

function valueMatches(token: string, value: number, min: number, max: number): boolean {
  const [base, stepPart] = token.split('/')
  const step = stepPart ? Number(stepPart) : 1
  if (!Number.isInteger(step) || step < 1) return false

  let rangeStart = min
  let rangeEnd = max
  if (base !== '*' && base) {
    const range = base.split('-').map(Number)
    if (range.length === 1) rangeStart = rangeEnd = range[0]
    else if (range.length === 2) [rangeStart, rangeEnd] = range
    else return false
  }
  if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeStart < min || rangeEnd > max || rangeStart > rangeEnd) return false
  return value >= rangeStart && value <= rangeEnd && (value - rangeStart) % step === 0
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  return field.split(',').some(token => valueMatches(token.trim(), value, min, max))
}

export function isValidCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  return fields.length === 5 && fields.every((field, index) => {
    const [min, max] = RANGES[index]
    return field.split(',').every(token => {
      const parts = token.trim().split('/')
      if (parts.length > 2 || !parts[0]) return false
      const [base, stepText] = parts
      const values = base === '*' ? [] : base.split('-').map(Number)
      const step = stepText === undefined ? 1 : Number(stepText)
      return Number.isInteger(step) && step > 0
        && values.length <= 2
        && values.every(value => Number.isInteger(value) && value >= min && value <= max)
        && (values.length !== 2 || values[0] <= values[1])
    })
  })
}

export function matchesCron(expression: string, date: Date): boolean {
  if (!isValidCron(expression)) return false
  const fields = expression.trim().split(/\s+/)
  const values = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()]
  return fields.every((field, index) => fieldMatches(field, values[index], RANGES[index][0], RANGES[index][1]))
}

export function nextCronTime(expression: string, from = Date.now()): number | null {
  if (!isValidCron(expression)) return null
  const candidate = new Date(from)
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)
  // A year of minute candidates keeps the function bounded even for rare schedules.
  for (let index = 0; index < 527040; index += 1) {
    if (matchesCron(expression, candidate)) return candidate.getTime()
    candidate.setMinutes(candidate.getMinutes() + 1)
  }
  return null
}
