FROM oven/bun:1
WORKDIR /app

RUN apt-get update && apt-get install -y bash curl && curl -1sLf \
  'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | bash \
  && apt-get update && apt-get install -y infisical

COPY package.json bun.lock .infisical.json ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/bot/package.json ./apps/bot/
COPY packages/database/package.json ./packages/database/
COPY packages/env/package.json ./packages/env/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/testing-library/package.json ./packages/testing-library/
COPY packages/rosepack/package.json ./packages/rosepack/
COPY packages/inference-engine/package.json ./packages/inference-engine/
COPY packages/components-jsx/package.json ./packages/components-jsx/

RUN bun install --frozen-lockfile

COPY . .

ARG INFISICAL_TOKEN
ENV INFISICAL_TOKEN=$INFISICAL_TOKEN
ENV NODE_ENV=production
ENV INFISICAL_ENV=prod
RUN bun run --filter="@packages/database" db:generate
RUN bun --filter="@packages/*" run build
RUN cd apps/dashboard && bun run nuxt build

ENV RUN_MIGRATE=false
ENV RUN_SEED=false

EXPOSE 3000/tcp
CMD infisical run --projectId=647ebfac-cb50-4d2d-9461-f821f4175d5c --recursive --env=prod -- bash -c "if [ \"$RUN_MIGRATE\" = \"true\" ]; then bun run --filter='@packages/database' db:migrate:deploy; fi && if [ \"$RUN_SEED\" = \"true\" ]; then bun run --filter='@packages/inference-engine' seed; fi && bun /app/apps/dashboard/.output/server/index.mjs"