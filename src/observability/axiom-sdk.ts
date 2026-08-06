import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_URL_FULL
} from '@opentelemetry/semantic-conventions'
import { randomUUID } from 'node:crypto'
import { redactTelemetryUrl, sensitiveQueryParameters } from './redaction.ts'
import type { AxiomObservabilityConfig } from './types.ts'

export function createAxiomSdk(config: AxiomObservabilityConfig) {
  const headers = {
    Authorization: `Bearer ${config.token}`
  }
  const instrumentations = getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-dns': { enabled: false },
    '@opentelemetry/instrumentation-fs': { enabled: false },
    '@opentelemetry/instrumentation-host-metrics': {
      enabled: true,
      metricGroups: ['process.cpu', 'process.memory']
    },
    '@opentelemetry/instrumentation-http': {
      redactedQueryParams: [...sensitiveQueryParameters],
      requireParentforOutgoingSpans: true
    },
    '@opentelemetry/instrumentation-net': { enabled: false },
    '@opentelemetry/instrumentation-openai': { enabled: false },
    '@opentelemetry/instrumentation-pino': { enabled: false },
    '@opentelemetry/instrumentation-runtime-node': {
      captureUncaughtException: true,
      enabled: true,
      monitoringPrecision: 20
    },
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
  const sdk = new NodeSDK({
    instrumentations: [instrumentations],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          headers: signalHeaders(headers, 'X-Axiom-Dataset', config.logsDataset),
          url: signalEndpoint(config.endpoint, 'logs')
        })
      })
    ],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          headers: signalHeaders(headers, 'X-Axiom-Metrics-Dataset', config.metricsDataset),
          url: signalEndpoint(config.endpoint, 'metrics')
        }),
        exportIntervalMillis: 30_000,
        exportTimeoutMillis: 10_000
      })
    ],
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: 'production',
        [ATTR_SERVICE_INSTANCE_ID]: randomUUID(),
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: config.serviceVersion
      })
    ),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          headers: signalHeaders(headers, 'X-Axiom-Dataset', config.tracesDataset),
          url: signalEndpoint(config.endpoint, 'traces')
        })
      )
    ]
  })

  return { instrumentations, sdk }
}

function signalHeaders(
  headers: Readonly<Record<string, string>>,
  datasetHeader: 'X-Axiom-Dataset' | 'X-Axiom-Metrics-Dataset',
  dataset: string
) {
  return {
    ...headers,
    [datasetHeader]: dataset
  }
}

function signalEndpoint(endpoint: string, signal: 'logs' | 'metrics' | 'traces'): string {
  const url = new URL(endpoint)
  const basePath = url.pathname
    .replace(/\/v1\/(?:logs|metrics|traces)\/?$/u, '')
    .replace(/\/$/u, '')
  url.pathname = `${basePath}/v1/${signal}`
  url.search = ''
  url.hash = ''
  return url.href
}
