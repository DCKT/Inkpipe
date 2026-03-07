# Inkpipe

Manga/comic pipeline: search, download, convert (via KCC), and upload to your e-reader.

## Run locally

```bash
npm install
npm run dev
```

## Run with Docker

```bash
docker build -t inkpipe .

docker run -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v inkpipe-config:/root/.inkpipe \
  -v inkpipe-tmp:/tmp/inkpipe \
  -e INKPIPE_TEMP_VOLUME=inkpipe-tmp \
  inkpipe
```

- `/var/run/docker.sock` — allows inkpipe to spawn KCC containers
- `inkpipe-config` — persists configuration across restarts
- `inkpipe-tmp` — shared named volume so KCC containers can access temp files
- `INKPIPE_TEMP_VOLUME` — tells inkpipe the volume name to mount into KCC containers (required when running in Docker)
