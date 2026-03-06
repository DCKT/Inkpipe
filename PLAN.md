The goal of this project is to facilitate the downloading / encoding of cbz files to booklore.
The process would be:

1. through an input, search for a book title on prowlarr
2. present the results on the app and allow multi-selection
3. when results are selected, a button download would appear.
4. On download button click, the app will download temporary the torrent files and upload them to alldebrid
5. The upload being asynchronous, I could be able to see the process somewhere on the page.
6. for each torrent uploaded, download the file temporary and remove the torrent files
7. on file download end, run a process that will execute kcc tools to convert the file to epub if the file itself is not an epub.
8. after the epub conversion, upload the epub file to a booklore instance that can be configured somewhere in the app.

# Technical decisions

I want to use react and tanstack start react and other tanstack libraries if needed.
Use ky as http client.

# Implementation Plan

## Tech Stack
- TanStack Start (React, file-based routing, server functions)
- TanStack Query (data fetching, polling)
- Ky (HTTP client)
- Zod (validation)
- Tailwind CSS v4 (styling)
- KCC local install (`kcc-c2e` in PATH)
- In-memory job store (MVP, no persistence across restarts)
- No auth (trusted local network)
- Booklore integration deferred (no API docs yet)

## Project Structure
```
src/
  routes/
    __root.tsx        # Layout: nav + global job status strip
    index.tsx         # Search + results + download trigger
    jobs.tsx          # Job progress list
    settings.tsx      # API keys & endpoints config
  components/
    SearchBar.tsx
    ResultsTable.tsx  # Multi-select checkbox table
    JobCard.tsx       # Per-job progress display
    SettingsForm.tsx
  lib/
    api/
      prowlarr.ts     # Prowlarr search client
      alldebrid.ts    # AllDebrid magnet/download client
    services/
      pipeline.ts     # Full download->convert orchestration
      kcc.ts          # child_process.spawn wrapper for kcc-c2e
      fileManager.ts  # Temp dir create/cleanup
    config.ts         # Read/write ~/.inkpipe/config.json
    jobs.ts           # In-memory Map<jobId, JobState>
  server/
    functions/
      search.ts       # createServerFn: proxy Prowlarr search
      download.ts     # createServerFn: start pipeline jobs
      jobs.ts         # createServerFn: return job statuses
      settings.ts     # createServerFn: get/set config
```

## Steps

### 1. Scaffold project ✅
- TanStack Start scaffold with file-based routing
- Deps: ky, zod, tailwindcss, @tanstack/react-query

### 2. Config management ✅
- Store in `~/.inkpipe/config.json`: Prowlarr URL+key, AllDebrid key, KCC path, temp dir
- Zod schema validation
- Settings page to edit, server functions to read/write

### 3. Prowlarr integration ✅
- `GET /api/v1/search?query={q}&type=search` with `X-Api-Key`
- Parse results: `{ title, guid, magnetUrl, size, seeders, indexer }`
- Server function proxies the call

### 4. Search UI (index page) ✅
- SearchBar -> TanStack Query calls server fn
- ResultsTable with checkboxes for multi-select
- "Download Selected" button -> mutation calling `startDownload`

### 5. AllDebrid integration ✅
- `POST /v4/magnet/upload` — upload magnet link, get magnet ID
- `GET /v4/magnet/status?id={id}` — poll until `status === 4`
- `GET /v4/link/unlock?link={link}` — get direct download URL
- Stream download to temp dir with progress tracking

### 6. Pipeline orchestration ✅
Per selected item, sequential stages:
1. `UPLOADING` — upload magnet to AllDebrid
2. `DEBRID_PROCESSING` — poll AllDebrid until ready
3. `DOWNLOADING` — stream file to `tmp/inkpipe/{jobId}/`
4. `CONVERTING` — run `kcc-c2e` if not already `.epub`
5. `DONE` — cleanup temp files
Errors -> `FAILED` with message in job state.

### 7. KCC integration ✅
- `child_process.spawn('kcc-c2e', ['--profile', configProfile, inputPath, '-o', outputDir])`
- Skip if file already `.epub`

### 8. Job tracking UI (jobs page) ✅
- TanStack Query polls `getJobs` every 3s
- JobCard: title, current stage, progress %, elapsed time
- Active/completed sections

### 9. Temp file handling ✅
- Default: `os.tmpdir() + '/inkpipe/'`
- Each job: `{tempDir}/{jobId}/`
- Cleanup after success; keep on error

### 10. (Deferred) Booklore upload
- Add stage `UPLOADING_BOOKLORE` after conversion when API docs available
- Multipart POST upload of epub file

## Verification
1. `npm run dev` — start dev server on port 3000
2. Navigate to `/settings`, configure Prowlarr URL + AllDebrid key
3. Search for a known title on `/` — confirm results display
4. Select items, click download — confirm jobs appear on `/jobs`
5. Watch job progress through stages until `DONE`
6. Check KCC conversion output for a CBZ input
