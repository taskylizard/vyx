import { OpenTelemetry } from '@ai-sdk/otel'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { registerTelemetry } from 'ai'
import { initAxiomAI, RedactionPolicy } from 'axiom/ai'

export interface AxiomObservabilityConfig {
  AXIOM_DATASET: string
  AXIOM_TOKEN: string
  OTEL_EXPORTER_OTLP_ENDPOINT: string
  OTEL_SERVICE_NAME: string
}

export interface AxiomObservability {
  shutdown(): Promise<void>
}

export function startAxiomObservability(config: AxiomObservabilityConfig): AxiomObservability {
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.OTEL_SERVICE_NAME
    }),
    spanProcessors: [
      new SimpleSpanProcessor(
        new OTLPTraceExporter({
          headers: {
            Authorization: `Bearer ${config.AXIOM_TOKEN}`,
            'X-Axiom-Dataset': config.AXIOM_DATASET
          },
          url: config.OTEL_EXPORTER_OTLP_ENDPOINT
        })
      )
    ]
  })

  provider.register()
  const tracer = provider.getTracer('kanikou')
  initAxiomAI({
    redactionPolicy: RedactionPolicy.AxiomDefault,
    tracer
  })
  registerTelemetry(new OpenTelemetry({ tracer }))

  return {
    shutdown: () => provider.shutdown()
  }
}
