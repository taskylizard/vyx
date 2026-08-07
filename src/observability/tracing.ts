import {
  context,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type AttributeValue,
  type Attributes,
  type Span
} from '@opentelemetry/api'
import { match } from 'ts-pattern'
import {
  isSensitiveTelemetryField,
  redactTelemetryText,
  redactTelemetryUrl,
  telemetryErrorMessage,
  telemetryException
} from './redaction.ts'
import type { LogFields, TraceOperationConfig } from './types.ts'

const tracer = trace.getTracer('kanikou')

export function runDetached<TResult>(operation: () => TResult): TResult {
  return context.with(ROOT_CONTEXT, operation)
}

export function traceBackgroundOperation<TResult>(
  name: string,
  attributes: LogFields | undefined,
  operation: () => Promise<TResult>
): Promise<TResult> {
  return traceOperation(name, { attributes, parent: 'root' }, async () => operation())
}

export async function traceOperation<TResult>(
  name: string,
  config: TraceOperationConfig,
  operation: (span: Span) => Promise<TResult>
): Promise<TResult> {
  const parentContext = match(config.parent)
    .with('active', () => context.active())
    .with('root', () => ROOT_CONTEXT)
    .exhaustive()

  return tracer.startActiveSpan(
    name,
    { attributes: toSpanAttributes(config.attributes) },
    parentContext,
    async (span) => {
      try {
        return await operation(span)
      } catch (error) {
        span.recordException(telemetryException(error))
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: telemetryErrorMessage(error)
        })
        throw error
      } finally {
        span.end()
      }
    }
  )
}

export function addActiveSpanEvent(name: string, fields?: LogFields): void {
  trace.getActiveSpan()?.addEvent(name, toSpanAttributes(fields))
}

export function setActiveSpanAttributes(fields: LogFields): void {
  trace.getActiveSpan()?.setAttributes(toSpanAttributes(fields))
}

function toSpanAttributes(fields: LogFields | undefined): Attributes {
  const attributes: Attributes = {}
  for (const [key, value] of Object.entries(fields ?? {})) {
    const attribute = isSensitiveTelemetryField(key) ? '[redacted]' : toSpanAttribute(value)
    if (attribute !== undefined) attributes[key] = attribute
  }
  return attributes
}

function toSpanAttribute(value: unknown): AttributeValue | undefined {
  if (value === undefined) return undefined
  if (value === null) return 'null'
  if (typeof value === 'string') return redactTelemetryText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof URL) return redactTelemetryUrl(value.href)
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === 'string')) return value
    if (value.every((entry) => typeof entry === 'number')) return value
    if (value.every((entry) => typeof entry === 'boolean')) return value
  }
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable value]'
  }
}
