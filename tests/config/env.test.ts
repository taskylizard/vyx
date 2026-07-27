import { expect, test } from 'vite-plus/test'
import { loadKanikouEnv } from '../../src/config/env.ts'

const requiredEnvironment = {
  KANIKOU_DISCORD_TOKEN: 'discord-test-token',
  OPENROUTER_API_KEY: 'openrouter-test-key'
}

test('uses console observability and ignores Axiom settings outside production', () => {
  const environment = loadKanikouEnv({
    ...requiredEnvironment,
    AXIOM_LOGS_DATASET: 'ignored-logs',
    AXIOM_TOKEN: 'ignored-token',
    AXIOM_TRACES_DATASET: 'ignored-traces',
    NODE_ENV: 'development'
  })

  expect(environment.observability).toEqual({
    kind: 'console',
    level: 'INFO',
    serviceName: 'kanikou'
  })
})

test('requires separate Axiom log and trace datasets in production', () => {
  expect(() =>
    loadKanikouEnv({
      ...requiredEnvironment,
      AXIOM_LOGS_DATASET: 'kanikou',
      AXIOM_TOKEN: 'axiom-token',
      AXIOM_TRACES_DATASET: 'kanikou',
      NODE_ENV: 'production'
    })
  ).toThrow('must be different datasets')
})

test('builds production Axiom observability from validated environment variables', () => {
  const environment = loadKanikouEnv({
    ...requiredEnvironment,
    AXIOM_LOGS_DATASET: 'kanikou-logs',
    AXIOM_TOKEN: 'axiom-token',
    AXIOM_TRACES_DATASET: 'kanikou-traces',
    NODE_ENV: 'production',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://example.axiom.test/otel',
    OTEL_SERVICE_NAME: 'kanikou-test'
  })

  expect(environment.observability).toEqual({
    endpoint: 'https://example.axiom.test/otel',
    kind: 'axiom',
    level: 'INFO',
    logsDataset: 'kanikou-logs',
    serviceName: 'kanikou-test',
    token: 'axiom-token',
    tracesDataset: 'kanikou-traces'
  })
})
