FROM docker.io/library/node:20-alpine
RUN apk add --update --no-cache python3 make g++
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml prisma/ ./
RUN pnpm install --frozen-lockfile

COPY . .

CMD [ "pnpm", "run", "start" ]
