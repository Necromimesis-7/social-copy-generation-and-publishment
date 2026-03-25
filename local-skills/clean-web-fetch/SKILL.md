---
name: clean-web-fetch
description: Use when you need cleaner webpage content than raw HTML. Fetches pages through markdown-cleaning services with fallback and basic boilerplate detection, returning readable Markdown plus source metadata.
---

# Clean Web Fetch

Use this skill when a user wants the contents of one or more webpages and the built-in fetch path is likely to be noisy, bloated, or blocked by page chrome.

## Workflow

1. Run the bundled fetcher first:

```bash
python3 {baseDir}/scripts/fetch_clean.py "https://example.com/article"
```

2. If structured output is helpful, request JSON:

```bash
python3 {baseDir}/scripts/fetch_clean.py "https://example.com/article" --json
```

3. For long pages, cap output length:

```bash
python3 {baseDir}/scripts/fetch_clean.py "https://example.com/article" --max-chars 6000
```

4. For a quick skim, request a short summary:

```bash
python3 {baseDir}/scripts/fetch_clean.py "https://example.com/article" --summary
```

5. Use the returned `source` and `warnings` fields when judging reliability.

## What the script does

- Tries cleaned-reader services in order:
  - `r.jina.ai`
  - `markdown.new`
  - `defuddle.md`
- Rejects obviously bad responses such as login walls, privacy interstitials, boilerplate, or raw HTML-heavy output
- Strips common cleaning-service wrappers such as `Title:`, `URL Source:`, `Published Time:`, and `Markdown Content:`
- Falls back to the original URL only when cleaned services fail

## How to use the result

- If `source` is a cleaning service and there are no warnings, treat the content as the preferred reading copy.
- If `source` is `original`, or warnings mention boilerplate / login / blocked content, tell the user the result may be incomplete.
- For login-gated or script-heavy sites, do not overclaim. Say the page could not be cleanly extracted and ask for another source only if needed.

## Notes

- Prefer this skill for article pages, docs pages, blog posts, and public marketing pages.
- Public social pages may still fail if the platform serves interstitial or anti-bot content.
- For multiple URLs, run the script once per URL instead of batching them into one request.
