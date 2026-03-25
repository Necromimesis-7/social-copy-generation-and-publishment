#!/usr/bin/env python3
"""
Clean Web Fetch

Fetch webpage contents through reader/markdown-cleaning services with fallback and
basic response validation. Designed for Codex skill usage.
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass


SSL_CONTEXT = ssl.create_default_context()
SSL_CONTEXT.check_hostname = False
SSL_CONTEXT.verify_mode = ssl.CERT_NONE

BOILERPLATE_PATTERNS = [
    re.compile(pattern, re.I)
    for pattern in [
        r"sign in",
        r"sign up",
        r"log in",
        r"create account",
        r"privacy policy",
        r"terms of service",
        r"cookie",
        r"enable javascript",
        r"download the app",
        r"open app",
        r"some privacy related extensions may cause issues on x\.com",
        r"please disable them and try again",
        r"this browser is no longer supported",
        r"something went wrong, but don.?t fret",
    ]
]

LEADING_METADATA_PATTERNS = [
    re.compile(r"^Title:\s*", re.I),
    re.compile(r"^URL Source:\s*", re.I),
    re.compile(r"^Published Time:\s*", re.I),
    re.compile(r"^Warning:\s*", re.I),
    re.compile(r"^Markdown Content:\s*$", re.I),
]


@dataclass
class FetchResult:
    success: bool
    source: str
    requested_url: str
    fetched_url: str
    content: str
    warnings: list[str]
    error: str | None = None


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def strip_service_wrappers(content: str) -> str:
    lines = [line.rstrip() for line in content.splitlines()]
    cleaned: list[str] = []
    skipping_leading_meta = True

    for line in lines:
        stripped = line.strip()

        if skipping_leading_meta:
            if not stripped:
                continue

            if any(pattern.match(stripped) for pattern in LEADING_METADATA_PATTERNS):
                continue

            skipping_leading_meta = False

        cleaned.append(line)

    while cleaned and not cleaned[0].strip():
        cleaned.pop(0)
    while cleaned and not cleaned[-1].strip():
        cleaned.pop()

    deduped: list[str] = []
    previous_nonempty = ""
    previous_heading = ""

    for line in cleaned:
        stripped = line.strip()

        if not stripped:
            if deduped and deduped[-1].strip():
                deduped.append(line)
            continue

        if stripped.startswith("#"):
            if stripped == previous_heading:
                continue
            previous_heading = stripped
        else:
            previous_heading = ""

        if stripped == previous_nonempty:
            continue

        deduped.append(line)
        previous_nonempty = stripped

    while deduped and not deduped[-1].strip():
        deduped.pop()

    return "\n".join(deduped).strip()


def limit_content(content: str, max_chars: int | None) -> str:
    if not max_chars or max_chars <= 0:
        return content

    if len(content) <= max_chars:
        return content

    clipped = content[: max_chars - 1].rsplit("\n", 1)[0].rstrip()
    if not clipped:
        clipped = content[: max_chars - 1].rstrip()

    return f"{clipped}\n\n[Truncated to {max_chars} characters]"


def summarize_markdown(content: str, max_items: int = 5) -> str:
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    if not lines:
        return ""

    summary_lines: list[str] = []
    seen: set[str] = set()
    for line in lines:
        normalized = normalize_text(line)
        if not normalized:
            continue

        dedupe_key = normalized.lower()
        if dedupe_key in seen:
            continue

        if line.startswith("#"):
            summary_lines.append(line)
            seen.add(dedupe_key)
        elif len(normalized) >= 40:
            summary_lines.append(f"- {normalized}")
            seen.add(dedupe_key)

        if len(summary_lines) >= max_items:
            break

    return "\n".join(summary_lines[:max_items]).strip()


def build_service_urls(target_url: str) -> list[tuple[str, str]]:
    stripped = target_url.strip()
    without_scheme = stripped.replace("https://", "").replace("http://", "")
    return [
        ("jina", f"https://r.jina.ai/http://{without_scheme}"),
        ("markdown-new", f"https://markdown.new/{stripped}"),
        ("defuddle", f"https://defuddle.md/{stripped}"),
        ("original", stripped),
    ]


def fetch_text(url: str, timeout: int) -> tuple[int, str]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
        },
    )

    with urllib.request.urlopen(request, timeout=timeout, context=SSL_CONTEXT) as response:
        content = response.read().decode("utf-8", errors="ignore")
        return response.status, content


def response_warnings(source: str, content: str) -> list[str]:
    warnings: list[str] = []
    text = normalize_text(content)

    if len(text) < 120:
        warnings.append("very-short-content")

    if len(re.findall(r"<[^>]+>", content)) > 30:
        warnings.append("html-heavy")

    if any(pattern.search(text) for pattern in BOILERPLATE_PATTERNS):
        warnings.append("boilerplate-or-interstitial")

    if source == "original":
        warnings.append("raw-page-fallback")

    return warnings


def is_acceptable(content: str, warnings: list[str], source: str) -> bool:
    text = normalize_text(content)
    if not text:
        return False

    if "boilerplate-or-interstitial" in warnings:
        return False

    if source != "original" and "html-heavy" in warnings:
        return False

    if source != "original" and len(text) < 120:
        return False

    return True


def get_clean_content(target_url: str, timeout: int) -> FetchResult:
    last_error: str | None = None

    for source, candidate_url in build_service_urls(target_url):
        try:
            status, content = fetch_text(candidate_url, timeout)
            if status != 200:
                last_error = f"{source} returned status {status}"
                continue

            warnings = response_warnings(source, content)
            if not is_acceptable(content, warnings, source):
                last_error = f"{source} returned unusable content"
                continue

            cleaned_content = strip_service_wrappers(content)

            return FetchResult(
                success=True,
                source=source,
                requested_url=target_url,
                fetched_url=candidate_url,
                content=cleaned_content,
                warnings=warnings,
            )
        except urllib.error.HTTPError as exc:
            last_error = f"{source} HTTP {exc.code}"
        except urllib.error.URLError as exc:
            last_error = f"{source} URL error: {exc.reason}"
        except Exception as exc:  # pragma: no cover - best effort tool
            last_error = f"{source} error: {exc}"

    return FetchResult(
        success=False,
        source="none",
        requested_url=target_url,
        fetched_url=target_url,
        content="",
        warnings=[],
        error=last_error or "All fetch attempts failed",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch cleaned webpage content with fallback.")
    parser.add_argument("url", help="Target webpage URL")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of plain text")
    parser.add_argument("--summary", action="store_true", help="Output a short summary view instead of full content")
    parser.add_argument("--max-chars", type=int, default=0, help="Truncate cleaned content to the given character count")
    parser.add_argument("--timeout", type=int, default=25, help="Request timeout in seconds")
    args = parser.parse_args()

    result = get_clean_content(args.url, args.timeout)

    if result.success:
        if args.summary:
            result.content = summarize_markdown(result.content)
            if not result.content:
                result.content = "No summary could be extracted from the cleaned content."
        else:
            result.content = limit_content(result.content, args.max_chars or None)

    if args.json:
        print(json.dumps(asdict(result), ensure_ascii=False, indent=2))
        return 0 if result.success else 1

    if not result.success:
        print(f"Error: {result.error}", file=sys.stderr)
        return 1

    print(f"# Source: {result.source}")
    print(f"# Requested URL: {result.requested_url}")
    print(f"# Fetched URL: {result.fetched_url}")
    if result.warnings:
        print(f"# Warnings: {', '.join(result.warnings)}")
    print()
    print(result.content)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
