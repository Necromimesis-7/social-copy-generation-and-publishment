#!/usr/bin/env python3

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


MONTH_PATTERN = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*"
WEEKDAY_PATTERN = r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)"
TIME_PATTERN = r"\d{1,2}:\d{2}\s*(?:AM|PM)"

DATE_PATTERNS = [
    rf"\b{WEEKDAY_PATTERN}\s*\({MONTH_PATTERN}\s+\d{{1,2}}\)\b",
    rf"\b{MONTH_PATTERN}\s+\d{{1,2}}(?:,\s*\d{{4}})?\b",
    rf"\b{WEEKDAY_PATTERN}\b",
    r"\b\d{4}-\d{2}-\d{2}\b",
    r"\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b",
    rf"\b{TIME_PATTERN}\b",
]

REWARD_KEYWORDS = [
    "reward",
    "rewards",
    "giveaway",
    "battle pass",
    "premium pass",
    "premium battle pass",
    "pass",
    "skin",
    "skins",
    "coin",
    "coins",
    "gem",
    "gems",
    "drop",
    "drops",
    "ticket",
    "tickets",
    "coupon",
    "coupons",
    "bonus",
    "bonuses",
]

UPDATE_KEYWORDS = [
    "update",
    "patch",
    "maintenance",
    "version",
    "hotfix",
    "event",
    "mode",
    "map",
    "season",
    "chapter",
    "mission",
    "quest",
    "weapon",
    "hero",
    "agent",
    "balance",
    "reward",
    "giveaway",
]

TREND_KEYWORDS = [
    "trend",
    "viral",
    "meme",
    "challenge",
    "template",
    "reaction",
    "remix",
    "duet",
]


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def unique(values):
    seen = set()
    result = []
    for value in values:
        clean = normalize_space(value)
        if not clean:
            continue
        key = clean.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(clean)
    return result


def command_available(name: str) -> bool:
    return bool(shutil.which(name))


def looks_like_noise(line: str) -> bool:
    text = normalize_space(line).lower()
    if not text:
        return True

    return any(
        [
            re.match(r"^\d{2,5}x\d{2,5}$", text),
            re.match(r"^\d+(\.\d+)?\s*(kb|mb|gb)$", text),
            re.match(r"^(image|video)/", text),
            text.startswith("duration "),
            text.startswith("frame count "),
            text.startswith("ocr "),
        ]
    )


def looks_like_low_quality_ocr(line: str) -> bool:
    text = normalize_space(line)
    lowered = text.lower()
    alpha_count = sum(1 for char in text if char.isalpha())
    alnum_count = sum(1 for char in text if char.isalnum())
    long_words = re.findall(r"[A-Za-z]{3,}", text)
    stronger_words = re.findall(r"[A-Za-z]{4,}", text)
    symbol_count = sum(1 for char in text if not char.isalnum() and not char.isspace())

    has_semantic_pattern = any(keyword in lowered for keyword in UPDATE_KEYWORDS + REWARD_KEYWORDS + TREND_KEYWORDS) or bool(
        extract_pattern_matches(text, DATE_PATTERNS)
    )

    if alpha_count < 4 and not has_semantic_pattern:
        return True

    if alnum_count and alpha_count / max(len(text), 1) < 0.35 and "@" not in text and "#" not in text and not has_semantic_pattern:
        return True

    if not long_words and not has_semantic_pattern and "@" not in text and "#" not in text:
        return True

    if len(stronger_words) < 2 and not has_semantic_pattern and "@" not in text and "#" not in text:
        return True

    if symbol_count / max(len(text), 1) > 0.18 and not has_semantic_pattern:
        return True

    return False


def run_tesseract(image_path: Path) -> str:
    if not command_available("tesseract") or not image_path.exists():
        return ""

    try:
        result = subprocess.run(
            ["tesseract", str(image_path), "stdout", "--psm", "6", "-l", "eng"],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
        if result.returncode != 0:
            return ""
        return normalize_space(result.stdout)
    except Exception:
        return ""


def split_signal_lines(text: str):
    if not text:
        return []

    rough = re.split(r"[\n\r]+|(?<=[.!?])\s+(?=[A-Z0-9#@])", text)
    lines = []
    for part in rough:
        clean = normalize_space(part)
        if not clean or len(clean) < 3:
            continue
        if looks_like_noise(clean):
            continue
        if looks_like_low_quality_ocr(clean):
            continue
        lines.append(clean)
    return unique(lines)


def extract_pattern_matches(text: str, patterns):
    matches = []
    if not text:
        return matches

    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            matches.append(match.group(0))
    return unique(matches)


def extract_keyword_lines(lines, keywords, limit=8):
    matches = []
    for line in lines:
        lowered = line.lower()
        if any(keyword in lowered for keyword in keywords):
            matches.append(line)
    return unique(matches)[:limit]


def score_key_detail(line: str) -> int:
    lowered = line.lower()
    score = 0
    if any(keyword in lowered for keyword in UPDATE_KEYWORDS):
        score += 4
    if any(keyword in lowered for keyword in REWARD_KEYWORDS):
        score += 4
    if re.search(r"\d", line):
        score += 2
    if re.search(r"[@#]", line):
        score += 1
    if len(line) > 24:
        score += 1
    return score


def build_key_details(lines):
    ranked = sorted(((score_key_detail(line), line) for line in unique(lines)), key=lambda item: (-item[0], item[1]))
    filtered = [line for score, line in ranked if score > 0]
    if filtered:
        return filtered[:8]
    return unique(lines)[:5]


def build_media_breakdown(args, frame_count: int, ocr_enabled: bool):
    parts = []
    if args.width and args.height:
        parts.append(f"{args.width}x{args.height}")
    if args.mime_type:
        parts.append(args.mime_type)
    if args.asset_type == "video" and args.duration:
        parts.append(f"Duration {args.duration:.1f}s")
    if frame_count:
        parts.append(f"{frame_count} frame{'s' if frame_count != 1 else ''} analyzed")
    parts.append(f"OCR {'enabled' if ocr_enabled else 'unavailable'}")
    return unique(parts)


def build_summary(visible_text, dates, rewards, update_items, key_details, media_breakdown):
    if update_items or rewards or dates:
        chunks = ["Detected update-style media signals."]
        if dates:
            chunks.append(f"Dates: {', '.join(dates[:3])}.")
        if rewards:
            chunks.append(f"Rewards: {', '.join(rewards[:3])}.")
        if update_items:
            chunks.append(f"Update items: {' | '.join(update_items[:3])}.")
        return normalize_space(" ".join(chunks))

    if key_details:
        return normalize_space(f"Detected key media details: {' | '.join(key_details[:3])}.")

    if visible_text:
        return normalize_space(f"Detected visible text: {' | '.join(visible_text[:2])}.")

    if media_breakdown:
        return normalize_space(f"Media metadata only: {' | '.join(media_breakdown[:3])}.")

    return "No meaningful media signals detected."


def main():
    parser = argparse.ArgumentParser(description="Extract structured signals from media files.")
    parser.add_argument("--file", required=True, help="Absolute path to the source image or video.")
    parser.add_argument("--asset-type", choices=["image", "video"], required=True)
    parser.add_argument("--mime-type", default="")
    parser.add_argument("--width", type=int, default=0)
    parser.add_argument("--height", type=int, default=0)
    parser.add_argument("--duration", type=float, default=0.0)
    parser.add_argument("--frame", action="append", default=[])
    parser.add_argument("--transcript", default="")
    parser.add_argument("--summary", default="")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    source_path = Path(args.file)
    frame_paths = [Path(frame) for frame in args.frame]
    ocr_enabled = command_available("tesseract")

    ocr_chunks = []
    if args.asset_type == "image":
        ocr_chunks.append(run_tesseract(source_path))
    else:
        for frame_path in frame_paths[:8]:
            ocr_chunks.append(run_tesseract(frame_path))

    visible_text = unique(
        split_signal_lines("\n".join(chunk for chunk in ocr_chunks if chunk))
    )[:12]

    transcript_lines = split_signal_lines(args.transcript)
    combined_lines = unique(visible_text + transcript_lines)
    dates = extract_pattern_matches(" ".join(combined_lines), DATE_PATTERNS)[:8]
    rewards = extract_keyword_lines(combined_lines, REWARD_KEYWORDS, limit=8)
    update_items = extract_keyword_lines(combined_lines, UPDATE_KEYWORDS, limit=8)
    trend_clues = extract_keyword_lines(combined_lines, TREND_KEYWORDS, limit=6)

    if args.summary:
        combined_lines = unique(split_signal_lines(args.summary) + combined_lines)

    key_details = build_key_details(combined_lines)
    media_breakdown = build_media_breakdown(args, len(frame_paths), ocr_enabled)
    summary = build_summary(visible_text, dates, rewards, update_items, key_details, media_breakdown)

    payload = {
        "summary": summary,
        "media_breakdown": media_breakdown,
        "visible_text": visible_text,
        "key_details": key_details,
        "dates": dates,
        "rewards": rewards,
        "update_items": update_items,
        "trend_clues": trend_clues,
        "ocr_enabled": ocr_enabled,
    }

    if args.json:
        sys.stdout.write(json.dumps(payload, ensure_ascii=True))
        return

    sys.stdout.write(json.dumps(payload, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
