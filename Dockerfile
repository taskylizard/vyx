FROM docker.io/library/node:20
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ffmpeg
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml prisma/ ./
RUN pnpm install --frozen-lockfile
RUN mkdir -p state/downloads

COPY . .

CMD [ "pnpm", "run", "start" ]
