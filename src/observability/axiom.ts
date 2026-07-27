import { OpenTelemetry } from '@ai-sdk/otel'
import { trace } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_URL_FULL
} from '@opentelemetry/semantic-conventions'
import { registerTelemetry } from 'ai'
import { initAxiomAI, RedactionPolicy } from 'axiom/ai'
import { randomUUID } from 'node:crypto'
import packageMetadata from '../../package.json' with { type: 'json' }
import { match } from 'ts-pattern'
import { createConsoleLogger, createOpenTelemetryLogger } from './logger.ts'
import { redactTelemetryUrl, sensitiveQueryParameters } from './redaction.ts'
import type {
  AxiomObservabilityConfig,
  KanikouObservability,
  KanikouObservabilityConfig
} from './types.ts'

export function startKanikouObservability(
  config: KanikouObservabilityConfig
): KanikouObservability {
  return match(config)
    .returnType<KanikouObservability>()
    .with({ kind: 'console' }, ({ level }) => ({
      logger: createConsoleLogger(level),
      shutdown: async () => undefined
    }))
    .with({ kind: 'axiom' }, (axiomConfig) => startAxiomObservability(axiomConfig))
    .exhaustive()
}

export function startAxiomObservability(config: AxiomObservabilityConfig): KanikouObservability {
  const headers = {
    Authorization: `Bearer ${config.token}`
  }
  const sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          redactedQueryParams: [...sensitiveQueryParameters],
          requireParentforOutgoingSpans: true
        },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-openai': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: false },
        '@opentelemetry/instrumentation-runtime-node': { enabled: false },
        '@opentelemetry/instrumentation-undici': {
          requestHook(span, request) {
            const url = redactTelemetryUrl(`${request.origin}${request.path}`)
            span.setAttribute(ATTR_URL_FULL, url)
            span.setAttribute('http.url', url)
          },
          requireParentforSpans: true
        },
        '@opentelemetry/instrumentation-winston': { enabled: false }
      })
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          headers: {
            ...headers,
            'X-Axiom-Dataset': config.logsDataset
          },
          url: signalEndpoint(config.endpoint, 'logs')
        })
      })
    ],
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: 'production',
        [ATTR_SERVICE_INSTANCE_ID]: randomUUID(),
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: packageMetadata.version
      })
    ),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          headers: {
            ...headers,
            'X-Axiom-Dataset': config.tracesDataset
          },
          url: signalEndpoint(config.endpoint, 'traces')
        })
      )
    ]
  })

  sdk.start()
  const tracer = trace.getTracer('kanikou')
  initAxiomAI({
    redactionPolicy: RedactionPolicy.OpenTelemetryDefault,
    tracer
  })
  registerTelemetry(new OpenTelemetry({ tracer }))

  return {
    logger: createOpenTelemetryLogger(config.level),
    async shutdown() {
      await sdk.shutdown()
      logs.disable()
      trace.disable()
    }
  }
}

function signalEndpoint(endpoint: string, signal: 'logs' | 'traces'): string {
  const url = new URL(endpoint)
  const basePath = url.pathname.replace(/\/v1\/(?:logs|traces)\/?$/u, '').replace(/\/$/u, '')
  url.pathname = `${basePath}/v1/${signal}`
  url.search = ''
  url.hash = ''
  return url.href
}
