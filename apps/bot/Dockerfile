FROM docker.io/library/node:23-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml prisma/ ./
RUN pnpm install --frozen-lockfile
RUN pnpm run db:generate

COPY . .

ENV NODE_ENV=production
CMD [ "pnpm", "run", "start" ]