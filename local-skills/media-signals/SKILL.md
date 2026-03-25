---
name: media-signals
description: Use when you need structured signals from uploaded images or videos for social copy generation. Extracts OCR text, dates, rewards, update items, and key details from media files and video frames, returning compact JSON that is suitable for prompt inputs.
---

# Media Signals

Use this skill when a task depends on turning image or video assets into structured facts for downstream copy generation.

## Workflow

1. Run the bundled extractor on the source asset:

```bash
python3 {baseDir}/scripts/extract_media_signals.py --file /absolute/path/to/file.png --asset-type image --json
```

2. For videos, pass extracted frames and any transcript text you already have:

```bash
python3 {baseDir}/scripts/extract_media_signals.py \
  --file /absolute/path/to/file.mp4 \
  --asset-type video \
  --duration 37.4 \
  --frame /absolute/path/to/frame-1.jpg \
  --frame /absolute/path/to/frame-2.jpg \
  --transcript "Optional transcript text" \
  --json
```

3. Treat the output as factual guidance, not final copy. The important fields are:
   - `summary`
   - `visible_text`
   - `key_details`
   - `dates`
   - `rewards`
   - `update_items`
   - `trend_clues`

## Notes

- OCR uses `tesseract` when available. If OCR is unavailable, the script still returns media metadata and transcript-derived signals.
- Prefer passing only a handful of representative video frames. The goal is signal extraction, not exhaustive scene description.
- Use the extracted JSON as generation input, not as user-facing copy.
