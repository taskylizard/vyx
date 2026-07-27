import { context, SpanStatusCode, trace } from '@opentelemetry/api'
import {
  logs,
  SeverityNumber,
  type AnyValue,
  type AnyValueMap,
  type Logger as OpenTelemetryLogger
} from '@opentelemetry/api-logs'
import { match } from 'ts-pattern'
import {
  isSensitiveTelemetryField,
  redactTelemetryText,
  redactTelemetryUrl,
  telemetryErrorMessage,
  telemetryException
} from './redaction.ts'
import type { KanikouLogger, LogFields, LogLevel } from './types.ts'

const LOG_PRIORITY = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
} satisfies Record<LogLevel, number>

interface LogEvent {
  attributes: AnyValueMap
  error: Error | string | undefined
  level: LogLevel
  message: string
}

type LogReporter = (event: LogEvent) => void

class StructuredLogger implements KanikouLogger {
  readonly #level: LogLevel
  readonly #report: LogReporter

  constructor(level: LogLevel, report: LogReporter) {
    this.#level = level
    this.#report = report
  }

  debug(message: string, fields?: LogFields): void {
    this.#log('DEBUG', message, fields)
  }

  error(message: string, fields?: LogFields): void {
    this.#log('ERROR', message, fields)
  }

  info(message: string, fields?: LogFields): void {
    this.#log('INFO', message, fields)
  }

  trace(message: string, fields?: LogFields): void {
    this.#log('TRACE', message, fields)
  }

  warn(message: string, fields?: LogFields): void {
    this.#log('WARN', message, fields)
  }

  #log(level: LogLevel, message: string, fields?: LogFields): void {
    if (LOG_PRIORITY[level] > LOG_PRIORITY[this.#level]) return

    const { attributes, error } = prepareLogFields(fields)
    match(level)
      .with('ERROR', () => {
        if (error === undefined) return
        const span = trace.getActiveSpan()
        span?.recordException(error)
        span?.setStatus({ code: SpanStatusCode.ERROR, message: telemetryErrorMessage(error) })
      })
      .with('WARN', 'INFO', 'DEBUG', 'TRACE', () => undefined)
      .exhaustive()

    this.#report({ attributes, error, level, message })
  }
}

export function createConsoleLogger(level: LogLevel): KanikouLogger {
  return new StructuredLogger(level, ({ attributes, error, level: eventLevel, message }) => {
    const details = error === undefined ? attributes : { ...attributes, error }
    const prefix = `${new Date().toISOString()} ${eventLevel} kanikou`

    match(eventLevel)
      .with('ERROR', () => console.error(prefix, message, details))
      .with('WARN', () => console.warn(prefix, message, details))
      .with('INFO', () => console.info(prefix, message, details))
      .with('DEBUG', () => console.debug(prefix, message, details))
      .with('TRACE', () => console.debug(prefix, message, details))
      .exhaustive()
  })
}

export function createOpenTelemetryLogger(level: LogLevel): KanikouLogger {
  const logger = logs.getLogger('kanikou')
  return new StructuredLogger(level, (event) => emitOpenTelemetryLog(logger, event))
}

function emitOpenTelemetryLog(logger: OpenTelemetryLogger, event: LogEvent): void {
  logger.emit({
    attributes: event.attributes,
    body: event.message,
    context: context.active(),
    exception: event.error,
    severityNumber: match(event.level)
      .returnType<SeverityNumber>()
      .with('ERROR', () => SeverityNumber.ERROR)
      .with('WARN', () => SeverityNumber.WARN)
      .with('INFO', () => SeverityNumber.INFO)
      .with('DEBUG', () => SeverityNumber.DEBUG)
      .with('TRACE', () => SeverityNumber.TRACE)
      .exhaustive(),
    severityText: event.level
  })
}

function prepareLogFields(fields: LogFields | undefined): {
  attributes: AnyValueMap
  error: Error | string | undefined
} {
  const attributes: AnyValueMap = {}
  const seen = new WeakSet<object>()
  let error: Error | string | undefined

  for (const [key, value] of Object.entries(fields ?? {})) {
    if (key === 'error') {
      error = telemetryException(value)
      continue
    }
    attributes[key] = isSensitiveTelemetryField(key) ? '[redacted]' : toLogValue(value, seen, 0)
  }

  return { attributes, error }
}

function toLogValue(value: unknown, seen: WeakSet<object>, depth: number): AnyValue {
  if (value === undefined || value === null) return value
  if (typeof value === 'string') return redactTelemetryText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'symbol' || typeof value === 'function') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (value instanceof URL) return redactTelemetryUrl(value.href)
  if (value instanceof Uint8Array) return `[binary ${value.byteLength} bytes]`
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack === undefined ? undefined : redactTelemetryText(value.stack)
    }
  }
  if (depth >= 5) return '[maximum depth]'
  if (seen.has(value)) return '[circular]'

  seen.add(value)
  if (Array.isArray(value)) {
    const items = value.slice(0, 100).map((item) => toLogValue(item, seen, depth + 1))
    seen.delete(value)
    return items
  }

  const result: AnyValueMap = {}
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    result[key] = isSensitiveTelemetryField(key) ? '[redacted]' : toLogValue(entry, seen, depth + 1)
  }
  seen.delete(value)
  return result
}
