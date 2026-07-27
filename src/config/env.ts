import { config as readDotenv } from 'dotenv'
import { createEnv } from 'typed-env'
import { LogLevel } from 'tracix'

export function loadKanikouEnv() {
  readDotenv({ quiet: true })
  return createEnv({
    KANIKOU_DISCORD_TOKEN: {
      type: 'string'
    },
    OPENROUTER_API_KEY: {
      type: 'string'
    },
    AXIOM_TOKEN: {
      type: 'string'
    },
    AXIOM_DATASET: {
      type: 'string'
    },
    OTEL_EXPORTER_OTLP_ENDPOINT: {
      type: 'string'
    },
    OTEL_SERVICE_NAME: {
      type: 'string'
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
      choices: [
        LogLevel.ERROR,
        LogLevel.WARN,
        LogLevel.SILLY,
        LogLevel.INFO,
        LogLevel.DEBUG,
        LogLevel.TRACE
      ],
      default: LogLevel.INFO
    }
  })
}

export type KanikouEnv = ReturnType<typeof loadKanikouEnv>
