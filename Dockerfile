# Builder stage - contains build dependencies and source code
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy package files for dependency installation
COPY package.json bun.lock .infisical.json ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/bot/package.json ./apps/bot/
COPY packages/database/package.json ./packages/database/
COPY packages/env/package.json ./packages/env/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/testing-library/package.json ./packages/testing-library/
COPY packages/inference-engine/package.json ./packages/inference-engine/
COPY packages/components-jsx/package.json ./packages/components-jsx/

# Install all dependencies (including devDependencies needed for build)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
ARG INFISICAL_TOKEN
ENV INFISICAL_TOKEN=$INFISICAL_TOKEN
ENV NODE_ENV=production
ENV INFISICAL_ENV=prod
RUN bun run --filter="@packages/database" db:generate
RUN bun --filter="@packages/*" run build
RUN cd apps/bot && bun run build
RUN cd apps/dashboard && bun run nuxt build

# Runtime stage - minimal image with only production dependencies and built artifacts
FROM oven/bun:1 AS runtime
WORKDIR /app

# Install only runtime dependencies (infisical CLI)
RUN apt-get update && apt-get install -y bash curl && curl -1sLf \
  'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | bash \
  && apt-get update && apt-get install -y infisical \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lock .infisical.json ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/bot/package.json ./apps/bot/
COPY packages/database/package.json ./packages/database/
COPY packages/env/package.json ./packages/env/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/testing-library/package.json ./packages/testing-library/
COPY packages/inference-engine/package.json ./packages/inference-engine/
COPY packages/components-jsx/package.json ./packages/components-jsx/

# Install only production dependencies
RUN bun install --frozen-lockfile --production

# Copy built artifacts from builder stage
COPY --from=builder /app/apps/dashboard/.output ./apps/dashboard/.output
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/src ./packages/database/src
COPY --from=builder /app/packages/components-jsx/dist ./packages/components-jsx/dist

ENV RUN_MIGRATE=false
ENV RUN_SEED=false
ENV NODE_ENV=production
ENV INFISICAL_ENV=prod

EXPOSE 3000/tcp
CMD infisical run --projectId=647ebfac-cb50-4d2d-9461-f821f4175d5c --recursive --env=prod -- bash -c "if [ \"$RUN_MIGRATE\" = \"true\" ]; then bun run --filter='@packages/database' db:migrate:deploy; fi && if [ \"$RUN_SEED\" = \"true\" ]; then bun run --filter='@packages/inference-engine' seed; fi && bun /app/apps/dashboard/.output/server/index.mjs"