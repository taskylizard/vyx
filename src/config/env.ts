import { config as readDotenv } from 'dotenv'
import { createEnv } from 'typed-env'
import { P, match } from 'ts-pattern'
import { resolveDeploymentVersion } from '../observability/deployment.ts'
import { LOG_LEVELS, type KanikouObservabilityConfig } from '../observability/types.ts'

export function loadKanikouEnv(environment: NodeJS.ProcessEnv = process.env) {
  if (environment === process.env) readDotenv({ quiet: true })
  const raw = createEnv(
    {
      NODE_ENV: {
        type: 'string',
        choices: ['development', 'production', 'test'],
        default: 'development'
      },
      KANIKOU_DISCORD_TOKEN: {
        type: 'string'
      },
      OPENROUTER_API_KEY: {
        type: 'string'
      },
      AXIOM_TOKEN: {
        type: 'string',
        optional: true
      },
      AXIOM_DATASET: {
        type: 'string',
        optional: true
      },
      AXIOM_LOGS_DATASET: {
        type: 'string',
        optional: true
      },
      AXIOM_METRICS_DATASET: {
        type: 'string',
        optional: true
      },
      AXIOM_TRACES_DATASET: {
        type: 'string',
        optional: true
      },
      KANIKOU_DEPLOYMENT_SHA: {
        type: 'string',
        optional: true
      },
      OTEL_EXPORTER_OTLP_ENDPOINT: {
        type: 'string',
        default: 'https://api.axiom.co'
      },
      OTEL_SERVICE_NAME: {
        type: 'string',
        default: 'kanikou'
      },
      PARALLEL_API_KEY: {
        type: 'string',
        optional: true
      },
      SUPADATA_API_KEY: {
        type: 'string',
        optional: true
      },
      MINTLIFY_MCP_OAUTH_FILE: {
        type: 'string',
        optional: true
      },
      GITHUB_TOKEN: {
        type: 'string',
        optional: true
      },
      FAUNA_URL: {
        type: 'string',
        optional: true
      },
      LASTFM_API_KEY: {
        type: 'string',
        optional: true
      },
      DISCOGS_TOKEN: {
        type: 'string',
        optional: true
      },
      KANIKOU_DATABASE_URL: {
        type: 'string',
        default: 'file:./data/kanikou.db'
      },
      LIBSQL_AUTH_TOKEN: {
        type: 'string',
        optional: true
      },
      LOG_LEVEL: {
        type: 'string',
        choices: LOG_LEVELS,
        default: 'INFO'
      }
    },
    { env: environment }
  )

  const {
    AXIOM_DATASET,
    AXIOM_LOGS_DATASET,
    AXIOM_METRICS_DATASET,
    AXIOM_TOKEN,
    AXIOM_TRACES_DATASET,
    KANIKOU_DEPLOYMENT_SHA,
    OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME,
    ...application
  } = raw
  const observability = match(raw.NODE_ENV)
    .returnType<KanikouObservabilityConfig>()
    .with('production', () => {
      const logsDataset = requiredProductionVariable('AXIOM_LOGS_DATASET', AXIOM_LOGS_DATASET)
      const metricsDataset = requiredProductionVariable(
        'AXIOM_METRICS_DATASET',
        AXIOM_METRICS_DATASET
      )
      const tracesDataset = requiredProductionVariable(
        'AXIOM_TRACES_DATASET',
        AXIOM_TRACES_DATASET ?? AXIOM_DATASET
      )
      if (new Set([logsDataset, metricsDataset, tracesDataset]).size !== 3) {
        throw new Error(
          'AXIOM_LOGS_DATASET, AXIOM_METRICS_DATASET, and AXIOM_TRACES_DATASET must be different datasets.'
        )
      }

      return {
        endpoint: OTEL_EXPORTER_OTLP_ENDPOINT,
        kind: 'axiom',
        level: raw.LOG_LEVEL,
        logsDataset,
        metricsDataset,
        serviceName: OTEL_SERVICE_NAME,
        serviceVersion: resolveDeploymentVersion({
          ...environment,
          KANIKOU_DEPLOYMENT_SHA
        }),
        token: requiredProductionVariable('AXIOM_TOKEN', AXIOM_TOKEN),
        tracesDataset
      }
    })
    .with(P.union('development', 'test'), () => ({
      kind: 'console',
      level: raw.LOG_LEVEL,
      serviceName: OTEL_SERVICE_NAME
    }))
    .exhaustive()

  return { ...application, observability }
}

export type KanikouEnv = ReturnType<typeof loadKanikouEnv>

function requiredProductionVariable(name: string, value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required when NODE_ENV is production.`)
  }
  return value
}
