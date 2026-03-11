# Stage 1: Build
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    unrar-free \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile --prod
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["npm", "start"]
