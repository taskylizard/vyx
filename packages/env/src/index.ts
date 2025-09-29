import { createEnv } from 'typed-env'

export const env = createEnv({
  DISCORD_TOKEN: { type: 'string' },
  // REVOLT_TOKEN: { type: 'string' },
  // DIVOLT_TOKEN: { type: 'string', optional: true },
  DATABASE_URL: { type: 'string' },
  NODE_ENV: {
    type: 'string',
    choices: ['development', 'production'],
    default: 'development'
  },
  REDIS_HOST: { type: 'string' },
  REDIS_PORT: { type: 'string', default: '6379' },
  TESTING_GUILD_ID: { type: 'string', optional: true },
  // INFLUXDB_URL: { type: 'string' },
  ERRORS_WEBHOOK_ID: { type: 'string' },
  ERRORS_WEBHOOK_TOKEN: { type: 'string' },
  // INFLUXDB_ADMIN_TOKEN: { type: 'string' },
  AXIOM_TOKEN: { type: 'string' },
  AXIOM_DATASET: { type: 'string', default: 'vyx' },
  AXIOM_ORG_ID: { type: 'string', optional: true },
  // HUGGINGFACE_API_KEY: { type: 'string' },
  // CLOUDFLARE_AI_ACCOUNT_ID: { type: 'string' },
  // CLOUDFLARE_AI_API_KEY: { type: 'string' },
  // CHROMA_API_HOST: { type: 'string' },
  AOC_SESSION: { type: 'string', optional: true },
  SMUGSHROOM_API: { type: 'string' },
  /** Dashboard */
  DISCORD_OAUTH_CLIENT_ID: { type: 'string' },
  DISCORD_OAUTH_CLIENT_SECRET: { type: 'string' },
  BETTER_AUTH_URL: { type: 'string' },
  /** Our custom inference engine */
  INFERENCE_TOKEN: { type: 'string' },
  GOOGLE_GENERATIVE_AI_API_KEY: { type: 'string' }
})

export default env
