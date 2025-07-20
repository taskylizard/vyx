import { createEnv } from "typed-env";

export default createEnv({
	DISCORD_TOKEN: { type: "string" },
	REVOLT_TOKEN: { type: "string" },
	DIVOLT_TOKEN: { type: "string" },
	DATABASE_URL: { type: "string" },
	NODE_ENV: {
		type: "string",
		choices: ["development", "production"],
		default: "development",
	},
	REDIS_HOST: { type: "string" },
	INFLUXDB_URL: { type: "string" },
	ERRORS_WEBHOOK_ID: { type: "string" },
	ERRORS_WEBHOOK_TOKEN: { type: "string" },
	INFLUXDB_ADMIN_TOKEN: { type: "string" },
	HUGGINGFACE_API_KEY: { type: "string" },
	CLOUDFLARE_AI_ACCOUNT_ID: { type: "string" },
	CLOUDFLARE_AI_API_KEY: { type: "string" },
	SEARXNG_API_HOST: { type: "string" },
	CHROMA_API_HOST: { type: "string" },
	AOC_SESSION: { type: "string" },
	SMUGSHROOM_API: { type: "string" },
	/** Dashboard */
	DISCORD_OAUTH_CLIENT_ID: { type: "string" },
	DISCORD_OAUTH_CLIENT_SECRET: { type: "string" },
	BETTER_AUTH_URL: { type: "string" },
});