# Stage 1: Build web frontend
FROM oven/bun:1.3.1-slim AS builder
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/watcher/package.json packages/watcher/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Stage 2: Runtime
FROM oven/bun:1.3.1-slim
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/watcher/package.json packages/watcher/
RUN bun install --frozen-lockfile --production --ignore-scripts
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unrar-free \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*
COPY packages/server/src packages/server/src
COPY packages/shared/src packages/shared/src
COPY packages/watcher/src packages/watcher/src
COPY --from=builder /app/packages/web/dist packages/web/dist
EXPOSE 3000
ENV NODE_ENV=production
CMD sh -c "bun run packages/watcher/src/index.ts & bun run packages/server/src/main.ts"
