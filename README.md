# Inkpipe

Manga/comic pipeline: search, download, convert, and upload to your e-reader.

## Features

- **Search** Prowlarr for manga/comics
- **Download** via AllDebrid
- **Convert** CBZ/CBR/ZIP/RAR/PDF to EPUB using KCC (Kindle Comic Converter)
- **Upload** to Copyparty file server
- **Browse** your Komga library with covers and filters

## Architecture

Monorepo: five packages managed by Bun workspaces.

| Package | Description | Stack |
|---------|-------------|-------|
| `packages/shared` | Domain types, API contracts, errors | Effect Schema v3 |
| `packages/db` | SQLite database layer (WAL mode) | Bun SQLite, Effect v3 |
| `packages/server` | HTTP API + pipeline orchestration | Bun.serve, Effect v3, @effect/platform |
| `packages/watcher` | Background watch process | Effect v3, web-push |
| `packages/web` | React SPA frontend | React 19, React Router v7, Ark UI v5, Tailwind v4, TanStack Query v5, ky |

## Local development

```bash
# Install dependencies
bun install

# Start both server and frontend
bun run dev

# Server: http://localhost:3000
# Web:   http://localhost:5173

# Run tests
bun run test

# Type check all packages
bun run typecheck
```

## Docker

```bash
docker compose up -d
```

Access at `http://localhost:3001` (port mapped from container 3000).

Data (database, settings, push keys) is persisted in the `inkpipe-data` Docker volume. To back up or use a host directory instead:

```yaml
# In docker-compose.yml, replace the named volume with a bind mount:
volumes:
  - ~/.inkpipe:/data
```

## Configuration

Settings are persisted to `~/.inkpipe/inkpipe.db` (Bun SQLite). Set `INKPIPE_DATA_DIR` to override this path (Docker uses `/data` by default). Required:

- **Prowlarr** — URL + API key for torrent search
- **AllDebrid** — API key for debrid service
- **KCC** — Docker image for comic conversion
- **Copyparty** (optional) — URL for file uploads
- **Komga** (optional) — URL + API key for library browsing
