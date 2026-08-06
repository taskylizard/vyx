import { OpenTelemetry } from '@ai-sdk/otel'
import { metrics, trace } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { registerTelemetry } from 'ai'
import { initAxiomAI, RedactionPolicy } from 'axiom/ai'
import packageMetadata from '../../package.json' with { type: 'json' }
import { match } from 'ts-pattern'
import { createAxiomSdk } from './axiom-sdk.ts'
import { createConsoleLogger, createOpenTelemetryLogger } from './logger.ts'
import { registerNodeRuntimeMetrics } from './runtime-metrics.ts'
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
  const { instrumentations, sdk } = createAxiomSdk(config)

  sdk.start()
  const unregisterRuntimeMetrics = registerNodeRuntimeMetrics(
    metrics.getMeter('kanikou.runtime', packageMetadata.version)
  )
  const tracer = trace.getTracer('kanikou')
  initAxiomAI({
    redactionPolicy: RedactionPolicy.OpenTelemetryDefault,
    tracer
  })
  registerTelemetry(new OpenTelemetry({ tracer }))

  return {
    logger: createOpenTelemetryLogger(config.level),
    async shutdown() {
      try {
        await sdk.shutdown()
      } finally {
        unregisterRuntimeMetrics()
        for (const instrumentation of instrumentations) instrumentation.disable()
        logs.disable()
        metrics.disable()
        trace.disable()
      }
    }
  }
}
