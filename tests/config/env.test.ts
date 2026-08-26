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
    AXIOM_METRICS_DATASET: 'ignored-metrics',
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
      AXIOM_METRICS_DATASET: 'kanikou',
      AXIOM_TOKEN: 'axiom-token',
      AXIOM_TRACES_DATASET: 'kanikou-traces',
      KANIKOU_DEPLOYMENT_SHA: '0123456789abcdef0123456789abcdef01234567',
      NODE_ENV: 'production'
    })
  ).toThrow('must be different datasets')
})

test('builds production Axiom observability from validated environment variables', () => {
  const environment = loadKanikouEnv({
    ...requiredEnvironment,
    AXIOM_LOGS_DATASET: 'kanikou-logs',
    AXIOM_METRICS_DATASET: 'kanikou-metrics',
    AXIOM_TOKEN: 'axiom-token',
    AXIOM_TRACES_DATASET: 'kanikou-traces',
    KANIKOU_DEPLOYMENT_SHA: '0123456789ABCDEF0123456789ABCDEF01234567',
    NODE_ENV: 'production',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://example.axiom.test/otel',
    OTEL_SERVICE_NAME: 'kanikou-test'
  })

  expect(environment.observability).toEqual({
    endpoint: 'https://example.axiom.test/otel',
    kind: 'axiom',
    level: 'INFO',
    logsDataset: 'kanikou-logs',
    metricsDataset: 'kanikou-metrics',
    serviceName: 'kanikou-test',
    serviceVersion: '0123456789abcdef0123456789abcdef01234567',
    token: 'axiom-token',
    tracesDataset: 'kanikou-traces'
  })
})

test('requires a dedicated metrics dataset in production', () => {
  expect(() =>
    loadKanikouEnv({
      ...requiredEnvironment,
      AXIOM_LOGS_DATASET: 'kanikou-logs',
      AXIOM_TOKEN: 'axiom-token',
      AXIOM_TRACES_DATASET: 'kanikou-traces',
      KANIKOU_DEPLOYMENT_SHA: '0123456789abcdef0123456789abcdef01234567',
      NODE_ENV: 'production'
    })
  ).toThrow('AXIOM_METRICS_DATASET is required')
})

test('passes through the optional hypixel skyblock settings untouched', () => {
  const environment = loadKanikouEnv({
    ...requiredEnvironment,
    HYPIXEL_API_KEY: 'hypixel-key',
    SKYBLOCK_CHANNEL_ID: 'channel-1',
    SKYBLOCK_DISCORD_USER_ID: 'user-1',
    SKYBLOCK_PLAYER_UUID: 'uuid',
    SKYBLOCK_PROFILE_NAME: 'Zucchini'
  })

  expect(environment.HYPIXEL_API_KEY).toBe('hypixel-key')
  expect(environment.SKYBLOCK_CHANNEL_ID).toBe('channel-1')
  expect(environment.SKYBLOCK_DISCORD_USER_ID).toBe('user-1')
  expect(environment.SKYBLOCK_PLAYER_UUID).toBe('uuid')
  expect(environment.SKYBLOCK_PROFILE_NAME).toBe('Zucchini')
})
