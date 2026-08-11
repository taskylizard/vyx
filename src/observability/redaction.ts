const ALWAYS_SENSITIVE_FIELD_WORDS = new Set([
  'apikey',
  'authorization',
  'cookie',
  'credential',
  'credentials',
  'password',
  'secret'
])
const TOKEN_METRIC_FIELD_WORDS = new Set([
  'accepted',
  'audio',
  'billable',
  'cache',
  'cached',
  'completion',
  'count',
  'estimated',
  'input',
  'max',
  'num',
  'output',
  'per',
  'prediction',
  'prompt',
  'rate',
  'read',
  'reasoning',
  'rejected',
  'second',
  'seconds',
  'text',
  'total',
  'usage',
  'used',
  'write'
])
const SENSITIVE_QUERY_PARAMETERS = new Set([
  'access_token',
  'api-key',
  'api_key',
  'apikey',
  'authorization',
  'client_secret',
  'password',
  'secret',
  'signature',
  'token'
])
const URL_IN_TEXT = /\b[a-z][a-z\d+.-]*:\/\/[^\s<>"']+/giu

export function isSensitiveTelemetryField(name: string): boolean {
  const words = name
    .replace(/([a-z\d])([A-Z])/gu, '$1_$2')
    .toLowerCase()
    .split(/[^a-z\d]+/u)
    .filter((word) => word.length > 0)
  if (words.some((word) => ALWAYS_SENSITIVE_FIELD_WORDS.has(word))) return true
  if (words.some((word, index) => word === 'api' && words[index + 1] === 'key')) return true

  const nonTokenWords = words.filter((word) => word !== 'token' && word !== 'tokens')
  if (nonTokenWords.length === words.length) return false
  if (nonTokenWords.length === 0) return true
  return nonTokenWords.some((word) => !TOKEN_METRIC_FIELD_WORDS.has(word))
}

export function redactTelemetryUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.username.length > 0) url.username = '[redacted]'
    if (url.password.length > 0) url.password = '[redacted]'
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_QUERY_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.set(key, '[redacted]')
      }
    }
    return url.href
  } catch {
    return value
  }
}

export function redactTelemetryText(value: string): string {
  return value.replace(URL_IN_TEXT, (url) => redactTelemetryUrl(url))
}

export const sensitiveQueryParameters = Object.freeze([...SENSITIVE_QUERY_PARAMETERS])

export function telemetryErrorMessage(error: unknown): string {
  if (error instanceof Error) return redactTelemetryText(error.message)
  if (typeof error === 'string') return redactTelemetryText(error)
  if (
    error === undefined ||
    error === null ||
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint'
  ) {
    return String(error)
  }
  try {
    return JSON.stringify(error, (key, value) => {
      if (key.length > 0 && isSensitiveTelemetryField(key)) return '[redacted]'
      if (typeof value === 'string') return redactTelemetryText(value)
      if (typeof value === 'bigint') return value.toString()
      return value
    })
  } catch {
    return '[unserializable error]'
  }
}

export function telemetryException(error: unknown): Error | string {
  if (!(error instanceof Error)) return telemetryErrorMessage(error)

  const sanitized = new Error(telemetryErrorMessage(error))
  sanitized.name = error.name
  if (error.stack !== undefined) sanitized.stack = redactTelemetryText(error.stack)
  return sanitized
}
