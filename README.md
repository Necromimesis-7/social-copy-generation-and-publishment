# Overseas Social Content Studio

Project-based social copy generator for overseas brand operations.

## Current scope

- Formal MVP PRD in `docs/PRD.md`
- Real local app flow for:
  - project switching
  - brand brief editing
  - account configuration with multi-account support per platform
- sample library input
- sample deletion
- multi-image or single-video generation input
- persisted generation history
- editable account-specific output display
- saved preferred variants for generated outputs
- generation provider labeling
- in-flight generation cancellation
- Metricool brand sync
- Metricool publish-now and scheduled publish job submission

## Current backend

- `server.mjs` now serves both the frontend and local JSON APIs
- SQLite database is stored at `data/app.db`
- Uploaded files are stored under `data/uploads/`
- COS direct upload is supported when `COS_ENABLED=true`
- Uploaded files are also exposed under `/uploads/...` for public-media publishing when `PUBLIC_APP_URL` points to a real HTTPS domain
- `.env` is loaded automatically if present

## Current generation behavior

- Generation is server-side and persistent
- The generation service now prioritizes up to 20 usable recent post samples before falling back to account notes and project guardrails
- `AI_PROVIDER=auto` prefers the internal gateway when `GATEWAY_API_KEY` is set, otherwise OpenAI when `OPENAI_API_KEY` is set, otherwise it falls back to the local generator
- `AI_PROVIDER=gateway` uses the internal OpenAI-compatible chat-completions gateway for text generation
- The default OpenAI model is `gpt-5-mini`
- Image generation inputs are sent to the OpenAI Responses API as multimodal image inputs
- Video uploads now try to extract visual frames before generation
- Link samples now attempt to expand into up to 20 imported reference posts when the source page exposes usable public text
- If `ffmpeg` is installed, the app extracts multiple frames across the video timeline
- On macOS without `ffmpeg`, the app falls back to `qlmanage` to attach a poster frame
- Video metadata is read from `ffprobe` when available, otherwise from macOS `mdls`
- Optional video transcription can be attempted through `POST /audio/transcriptions` when using the official OpenAI API
- Default frame sampling is duration-aware:
  - up to `6s`: `4` frames
  - up to `15s`: `5` frames
  - up to `30s`: `6` frames
  - up to `60s`: `8` frames
  - up to `180s`: `12` frames
  - over `180s`: capped by `MAX_VIDEO_FRAMES` (default `12`)

## Internal Gateway setup

If you want to use the internal LeiHuo model gateway for copy generation, copy `.env.example` to `.env` and fill these values:

```bash
cp .env.example .env
```

Example `.env`:

```bash
AI_PROVIDER=gateway
DATA_ROOT=
GATEWAY_API_KEY=your_gateway_key_here
GATEWAY_MODEL=gpt-5.4
GATEWAY_BASE_URL=https://ai.leihuo.netease.com/v1
GATEWAY_REQUEST_TIMEOUT_MS=45000
MAX_VIDEO_FRAMES=12
MAX_IMPORTED_SAMPLES=20
SAMPLE_IMPORT_TIMEOUT_MS=15000
```

Notes:

- The current gateway provider uses your locally extracted media signals plus the approved recent-post library. It does not send raw images or video frames to the text model.
- This keeps image/video understanding independent from the text model and works well with the current project architecture.

## OpenAI setup

Copy `.env.example` to `.env` and fill in your key:

```bash
cp .env.example .env
```

Example `.env`:

```bash
AI_PROVIDER=auto
DATA_ROOT=
GATEWAY_API_KEY=
GATEWAY_MODEL=gpt-5.4
GATEWAY_BASE_URL=https://ai.leihuo.netease.com/v1
GATEWAY_REQUEST_TIMEOUT_MS=45000
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
ENABLE_VIDEO_TRANSCRIPTION=auto
MAX_VIDEO_FRAMES=12
OPENAI_VISUAL_INPUT_LIMIT=12
OPENAI_REQUEST_TIMEOUT_MS=45000
MAX_IMPORTED_SAMPLES=20
SAMPLE_IMPORT_TIMEOUT_MS=15000
```

Notes:

- `DATA_ROOT` is optional locally. Set it in production when your host mounts a persistent disk somewhere outside the repo checkout.
- `ENABLE_VIDEO_TRANSCRIPTION=auto` only attempts transcription when the base URL points to the official OpenAI API.
- If you are using a local OpenAI-compatible proxy, set `ENABLE_VIDEO_TRANSCRIPTION=true` only if that proxy also supports `/audio/transcriptions`.
- `GET /api/health` now returns both `generatorMode` and `videoProcessing` capabilities, which is useful for debugging local media support.
- `GATEWAY_BASE_URL=https://ai.leihuo.netease.com/v1` with `GATEWAY_MODEL=gpt-5.4` is the recommended internal gateway configuration for this project.
- `MAX_VIDEO_FRAMES` controls how many timestamps are sampled from one uploaded video before generation.
- `OPENAI_VISUAL_INPUT_LIMIT` controls how many total images or extracted frames are actually sent into the model request.
- `OPENAI_REQUEST_TIMEOUT_MS` controls how long the app waits for the upstream Responses API before falling back to the local generator.
- `MAX_IMPORTED_SAMPLES` controls how many imported recent-post references one link can contribute.
- `SAMPLE_IMPORT_TIMEOUT_MS` controls how long the app waits when importing public sample links.

## Metricool setup

The app now supports Metricool brand sync plus publish-now / scheduled submission through the official Metricool API.

Add these values to `.env`:

```bash
METRICOOL_API_TOKEN=your_metricool_api_token
METRICOOL_USER_ID=your_metricool_user_id
METRICOOL_BASE_URL=https://app.metricool.com/api
PUBLIC_APP_URL=https://your-public-app-domain
PUBLISH_POLL_INTERVAL_MS=15000
```

Notes:

- `METRICOOL_API_TOKEN` and `METRICOOL_USER_ID` are required before the app can sync Metricool brands.
- `PUBLIC_APP_URL` should be a public HTTPS base URL where Metricool can fetch uploaded media. If it is missing or points to localhost, media-required channels such as Instagram, TikTok, and YouTube will reject publishing.
- On Render, if `PUBLIC_APP_URL` is left blank, the app will automatically fall back to `https://${RENDER_EXTERNAL_HOSTNAME}`.
- Scheduled publishing depends on this app process staying online. The local dispatcher checks queued jobs every `PUBLISH_POLL_INTERVAL_MS`.
- Current Metricool integration assumes one connected channel per network inside a Metricool brand. If you manage multiple accounts on the same platform, they usually need separate Metricool brands to publish distinctly.

## COS direct upload setup

For frequent large-video workloads, enable Tencent COS direct upload so the browser sends files straight to COS before generation starts.

Add these values to `.env`:

```bash
COS_ENABLED=true
COS_BUCKET=social-studio-1416229279
COS_REGION=ap-singapore
COS_SECRET_ID=your_cam_secret_id
COS_SECRET_KEY=your_cam_secret_key
COS_UPLOAD_PREFIX=uploads
COS_PUBLIC_BASE_URL=https://social-studio-1416229279.cos.ap-singapore.myqcloud.com
COS_DIRECT_UPLOAD_MIN_BYTES=0
```

Notes:

- Install the new backend dependency after pulling the latest code:
  - `npm install`
- The app now exposes `POST /api/uploads/cos-sts` and uses Tencent COS temporary credentials in the browser.
- Generation requests can reference already-uploaded COS assets, so large videos no longer need to pass through the web server first.
- Set the bucket to `public-read / private-write` if you want Metricool to fetch uploaded media directly.
- Configure COS CORS to allow your site origins, such as:
  - `http://43.128.96.212`
  - `http://localhost:4175`
- `COS_REGION` should use the API region format, for example `ap-singapore`.
- `COS_DIRECT_UPLOAD_MIN_BYTES=0` means all selected assets use COS direct upload when configured. Raise it later if you only want big files to go through COS.

## Deploy publicly

The simplest production path for the current architecture is a single always-on Node web service with a persistent disk. This app stores SQLite and uploaded files on disk, and scheduled publish jobs are dispatched from the app process itself, so serverless hosts are not a good fit.

This repo now includes [render.yaml](/Users/lufeng/Documents/codex_test_01/render.yaml) for Render.

Recommended Render setup:

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and point it at the repo.
3. Keep the generated web service on a paid always-on plan and keep the attached disk enabled.
4. Fill the secret env vars in Render:
   - `GATEWAY_API_KEY`
   - `METRICOOL_API_TOKEN`
   - `METRICOOL_USER_ID`
   - `PUBLIC_APP_URL` (optional on Render now)
5. If you leave `PUBLIC_APP_URL` blank, the service will use its Render hostname automatically. If you later bind a custom domain, set `PUBLIC_APP_URL` to that custom HTTPS domain and redeploy once.
6. Open `/api/health` on the deployed domain and confirm:
   - `ok: true`
   - `metricool.configured: true`

Deployment notes:

- `npm start` now respects the platform-provided `PORT`. Local development still uses `4175`.
- `DATA_ROOT=/var/data` is set in the blueprint so SQLite and uploads survive restarts.
- If you later scale past one instance, the current in-process scheduler will need to move to a dedicated worker or external queue.

## Run locally

```bash
npm run dev
```

Then open `http://localhost:4175`.

## Files

- `docs/PRD.md`: product requirements document
- `public/index.html`: app shell markup
- `public/styles.css`: visual system and layout
- `public/app.js`: frontend UI and real API integration
- `server.mjs`: backend server, APIs, SQLite bootstrap, and static serving
- `backend/env.mjs`: lightweight `.env` loader
- `backend/seed-data.mjs`: seed projects and default project config
- `backend/generator.mjs`: provider selection between the internal gateway, OpenAI, and fallback
- `backend/gateway-generator.mjs`: internal gateway chat-completions integration
- `backend/openai-generator.mjs`: OpenAI Responses API integration
- `backend/fallback-generator.mjs`: deterministic local fallback generator

## Next recommended build steps

1. Add link parsing beyond raw URL storage.
2. Add Metricool publish-job polling so local status can reflect real post outcomes after submission.
3. Add user auth and workspace-level access control when collaboration starts to matter.
4. Add output revision history if teams need auditability on saved edits.
