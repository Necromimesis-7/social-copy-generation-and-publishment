import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { isUsableSampleText, normalizeSampleText } from "./sample-quality.mjs";

const SAMPLE_IMPORT_TIMEOUT_MS = Math.max(5000, Number(process.env.SAMPLE_IMPORT_TIMEOUT_MS || 15000));
const MAX_IMPORTED_SAMPLES = Math.max(1, Number(process.env.MAX_IMPORTED_SAMPLES || 20));
const execFileAsync = promisify(execFile);

function resolveCleanFetchScript() {
  const candidates = [
    process.env.CLEAN_FETCH_SCRIPT_PATH,
    join(process.cwd(), "local-skills", "clean-web-fetch", "scripts", "fetch_clean.py"),
    join(homedir(), ".codex", "skills", "clean-web-fetch", "scripts", "fetch_clean.py"),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || null;
}

const KEY_PATTERNS = [
  { key: "articleBody", score: 6 },
  { key: "caption", score: 6 },
  { key: "text", score: 5 },
  { key: "sharedContent", score: 5 },
  { key: "description", score: 4 },
  { key: "contentText", score: 4 },
  { key: "headline", score: 3 },
  { key: "name", score: 2 },
  { key: "title", score: 1 },
];

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalizeWhitespace(value) {
  return normalizeSampleText(decodeHtmlEntities(String(value || "").replace(/\s+/g, " ")).trim());
}

function normalizeForDedupe(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function stripMarkdown(text) {
  const normalized = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) => {
      const label = decodeHtmlEntities(String(alt || ""))
        .replace(/^image\s+\d+:\s*/i, "")
        .trim();

      if (!label || /^image$/i.test(label) || label.length > 8) {
        return " ";
      }

      return ` ${label} `;
    })
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, " ");

  const lines = normalized.split("\n").map((line) =>
    decodeHtmlEntities(line)
      .replace(/^#{1,6}\s+/, "")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isLikelyXUrl(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)x\.com$/i.test(parsed.hostname) || /(^|\.)twitter\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function isLikelyXStatusUrl(url) {
  try {
    const parsed = new URL(url);
    return isLikelyXUrl(url) && /\/status\/\d+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function parsePublishedAt(value) {
  const text = normalizeWhitespace(value);
  const timeFirstMatch = text.match(
    /\b(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[·•]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4})\b/i,
  );
  const dateFirstMatch = text.match(
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i,
  );
  const normalizedTimestamp = timeFirstMatch
    ? `${timeFirstMatch[2]} ${timeFirstMatch[1]}`
    : dateFirstMatch
      ? `${dateFirstMatch[1]} ${dateFirstMatch[2]}`
      : null;

  if (!normalizedTimestamp) {
    return null;
  }

  const parsed = new Date(normalizedTimestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function findNearDuplicateCandidate(candidates, dedupeKey) {
  return candidates.find((candidate) => {
    const existingKey = normalizeForDedupe(candidate.body);
    if (!existingKey || existingKey === dedupeKey) {
      return false;
    }

    const minLength = Math.min(existingKey.length, dedupeKey.length);
    if (minLength < 72) {
      return false;
    }

    return existingKey.includes(dedupeKey) || dedupeKey.includes(existingKey);
  });
}

function addCandidate(candidates, seen, body, options = {}) {
  const cleanBody = normalizeWhitespace(body);
  if (!isUsableSampleText(cleanBody)) {
    return;
  }

  const dedupeKey = normalizeForDedupe(cleanBody);
  if (seen.has(dedupeKey)) {
    const existing = seen.get(dedupeKey);
    existing.score = Math.max(existing.score, options.score || 0);
    existing.publishedAt = existing.publishedAt || options.publishedAt || null;
    return;
  }

  const nearDuplicate = findNearDuplicateCandidate(candidates, dedupeKey);
  if (nearDuplicate) {
    const currentKey = normalizeForDedupe(nearDuplicate.body);
    if (dedupeKey.length > currentKey.length || (options.score || 0) > nearDuplicate.score) {
      seen.delete(currentKey);
      nearDuplicate.body = cleanBody;
      nearDuplicate.publishedAt = nearDuplicate.publishedAt || options.publishedAt || null;
      nearDuplicate.score = Math.max(nearDuplicate.score, options.score || 0);
      nearDuplicate.source = nearDuplicate.source || options.source || "unknown";
      seen.set(dedupeKey, nearDuplicate);
    }
    return;
  }

  const candidate = {
    body: cleanBody,
    publishedAt: options.publishedAt || null,
    score: options.score || 0,
    source: options.source || "unknown",
    order: candidates.length,
  };
  seen.set(dedupeKey, candidate);
  candidates.push(candidate);
}

function collectMarkdownParagraphs(content, candidates, seen) {
  const stripped = stripMarkdown(content);
  stripped
    .split(/\n\s*\n+/)
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean)
    .slice(0, 80)
    .forEach((segment) => {
      if (/^(conversation|url source|markdown content)$/i.test(segment)) {
        return;
      }

      if (/^\d[\d,]*\s+views?$/i.test(segment)) {
        return;
      }

      addCandidate(candidates, seen, segment, {
        score: 3,
        source: "markdown",
        publishedAt: parsePublishedAt(segment),
      });
    });
}

function cleanXSegment(segment) {
  return normalizeWhitespace(
    String(segment || "")
      .replace(/\s*\/\s*X\s*$/gi, " ")
      .replace(/^["'“”]+|["'“”]+$/g, " ")
      .replace(/https:\/\/t\.co\/\S+/gi, " ")
      .replace(/\bURL Source:.*$/gi, " ")
      .replace(/\bPublished Time:.*$/gi, " ")
      .replace(/Markdown Content:/gi, " "),
  );
}

function isXNoiseParagraph(segment) {
  return (
    !segment ||
    /^(conversation|url source|markdown content)$/i.test(segment) ||
    /^published time:/i.test(segment) ||
    /^\d[\d,]*\s+views?$/i.test(segment) ||
    /^(fragpunk|@playfragpunk|playfragpunk)$/i.test(segment) ||
    /^@\w+$/i.test(segment) ||
    /^\d{1,2}:\d{2}\s*(?:AM|PM)\s*[·•]/i.test(segment)
  );
}

function collectLeadingBodyParagraphs(paragraphs) {
  const body = [];
  for (const paragraph of paragraphs) {
    if (isXNoiseParagraph(paragraph)) {
      if (body.length) {
        break;
      }
      continue;
    }

    body.push(paragraph);
    if (body.length >= 4) {
      break;
    }
  }
  return body;
}

function collectConversationBodyParagraphs(paragraphs) {
  const body = [];
  const conversationIndex = paragraphs.findIndex((paragraph) => /^conversation$/i.test(paragraph));
  const startIndex = conversationIndex >= 0 ? conversationIndex + 1 : 0;

  for (let index = startIndex; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];

    if (/^\d{1,2}:\d{2}\s*(?:AM|PM)\s*[·•]/i.test(paragraph) || /^\d[\d,]*\s+views?$/i.test(paragraph)) {
      break;
    }

    if (isXNoiseParagraph(paragraph)) {
      if (body.length) {
        const nextMeaningful = paragraphs
          .slice(index + 1)
          .find((item) => item && !isXNoiseParagraph(item) && !/^https?:\/\/\S+$/i.test(item));

        if (
          /^@\w+$/i.test(paragraph) &&
          /\b(follow|reply|tag|dm|mention)\s*$/i.test(body[body.length - 1] || "") &&
          nextMeaningful &&
          /^[+&]/.test(nextMeaningful)
        ) {
          body.push(paragraph);
          continue;
        }

        break;
      }
      continue;
    }

    if (/^https?:\/\/\S+$/i.test(paragraph)) {
      continue;
    }

    body.push(paragraph);
    if (body.length >= 5) {
      break;
    }
  }

  return body;
}

function collectXMarkdownCandidates(content, candidates, seen, options = {}) {
  const cleaned = stripMarkdown(content)
    .replace(/\s*\/\s*X\s*$/gim, "")
    .replace(/\bURL Source:.*$/gim, " ")
    .replace(/\bPublished Time:.*$/gim, " ")
    .replace(/Markdown Content:/gim, " ");
  const sharedPublishedAt = parsePublishedAt(cleaned);

  const paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map((segment) => cleanXSegment(segment))
    .filter(Boolean)
    .slice(0, 50);

  const leadBody = collectLeadingBodyParagraphs(paragraphs);
  if (leadBody.length) {
    addCandidate(candidates, seen, leadBody.join(" "), {
      score: 10,
      source: "x-markdown-status",
      publishedAt: sharedPublishedAt,
    });
  }

  const conversationBody = collectConversationBodyParagraphs(paragraphs);
  if (conversationBody.length) {
    addCandidate(candidates, seen, conversationBody.join(" "), {
      score: 12,
      source: "x-markdown-conversation",
      publishedAt: sharedPublishedAt,
    });
  }

  if (!options.statusOnly) {
    paragraphs.forEach((segment) => {
      if (isXNoiseParagraph(segment) || /^https?:\/\/\S+$/i.test(segment)) {
        return;
      }

      addCandidate(candidates, seen, segment, {
        score: /weekly giveaway|battle pass|follow|rt|enter/i.test(segment) ? 7 : 4,
        source: "x-markdown",
        publishedAt: parsePublishedAt(segment) || sharedPublishedAt,
      });
    });
  }
}

function maybeAddStructuredCandidate(object, candidates, seen) {
  const publishedAt =
    object.datePublished ||
    object.uploadDate ||
    object.dateCreated ||
    object.createdAt ||
    object.publishedAt ||
    null;

  KEY_PATTERNS.forEach(({ key, score }) => {
    if (typeof object?.[key] === "string") {
      addCandidate(candidates, seen, object[key], {
        publishedAt,
        score,
        source: "structured",
      });
    }
  });
}

function visitStructuredNode(node, candidates, seen, depth = 0) {
  if (!node || depth > 12) {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => visitStructuredNode(item, candidates, seen, depth + 1));
    return;
  }

  if (typeof node !== "object") {
    return;
  }

  maybeAddStructuredCandidate(node, candidates, seen);

  Object.values(node).forEach((value) => {
    if (value && typeof value === "object") {
      visitStructuredNode(value, candidates, seen, depth + 1);
    }
  });
}

function collectJsonLd(html, candidates, seen) {
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }

    try {
      visitStructuredNode(JSON.parse(raw), candidates, seen);
    } catch {
      continue;
    }
  }
}

function collectDirectJson(content, candidates, seen) {
  const raw = String(content || "").trim();
  if (!raw) {
    return;
  }

  if (!(raw.startsWith("{") || raw.startsWith("["))) {
    return;
  }

  try {
    visitStructuredNode(JSON.parse(raw), candidates, seen);
  } catch {
    return;
  }
}

function collectJsonLikeFields(html, candidates, seen) {
  const fieldPattern =
    /"(articleBody|caption|text|sharedContent|description|contentText|headline|title|name)"\s*:\s*"((?:\\.|[^"\\])+)"/g;

  for (const match of html.matchAll(fieldPattern)) {
    try {
      const decoded = JSON.parse(`"${match[2]}"`);
      const priority = KEY_PATTERNS.find((item) => item.key === match[1])?.score || 1;
      addCandidate(candidates, seen, decoded, {
        score: priority - 1,
        source: "json-like",
      });
    } catch {
      continue;
    }
  }
}

function collectMetaContent(html, candidates, seen) {
  const metaPattern =
    /<meta\b[^>]+(?:property|name)=["'](?:og:description|twitter:description|description|og:title|twitter:title)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(metaPattern)) {
    addCandidate(candidates, seen, match[1], {
      score: 1,
      source: "meta",
    });
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    addCandidate(candidates, seen, titleMatch[1], {
      score: 1,
      source: "title",
    });
  }
}

function collectParagraphs(html, candidates, seen) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|article|section|li|br|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{2,}/g, "\n");

  stripped
    .split("\n")
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean)
    .slice(0, 400)
    .forEach((segment) => {
      addCandidate(candidates, seen, segment, {
        score: 1,
        source: "body",
      });
    });
}

export function extractImportedSamplesFromHtml(html, { limit = MAX_IMPORTED_SAMPLES } = {}) {
  const candidates = [];
  const seen = new Map();
  const content = String(html || "");

  collectDirectJson(content, candidates, seen);
  collectJsonLd(content, candidates, seen);
  collectJsonLikeFields(content, candidates, seen);
  collectMetaContent(content, candidates, seen);
  collectParagraphs(content, candidates, seen);

  return candidates
    .sort((left, right) => {
      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.order - right.order;
    })
    .slice(0, limit)
    .map((candidate) => ({
      body: candidate.body,
      publishedAt: candidate.publishedAt || null,
    }));
}

export function extractImportedSamplesFromMarkdown(content, options = {}) {
  const candidates = [];
  const seen = new Map();
  const raw = String(content || "");
  const isStatusUrl = isLikelyXStatusUrl(options.url || "");

  if (isLikelyXUrl(options.url || "")) {
    collectXMarkdownCandidates(raw, candidates, seen, { statusOnly: isStatusUrl });
  }

  collectMarkdownParagraphs(raw, candidates, seen);

  const sorted = candidates
    .sort((left, right) => {
      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.order - right.order;
    })
    .slice(0, isStatusUrl ? 1 : options.limit || MAX_IMPORTED_SAMPLES)
    .map((candidate) => ({
      body: candidate.body,
      publishedAt: candidate.publishedAt || null,
    }));

  return sorted;
}

async function fetchCleanContent(url) {
  const cleanFetchScript = resolveCleanFetchScript();
  if (!cleanFetchScript) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync(
      "python3",
      [
        cleanFetchScript,
        url,
        "--json",
        "--max-chars",
        "25000",
        "--timeout",
        String(Math.ceil(SAMPLE_IMPORT_TIMEOUT_MS / 1000)),
      ],
      {
        timeout: SAMPLE_IMPORT_TIMEOUT_MS + 5000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    const payload = JSON.parse(stdout || "{}");
    if (!payload?.success || !payload?.content) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function importSamplesFromUrl(url, options = {}) {
  const cleanPayload = await fetchCleanContent(url);
  if (cleanPayload?.content) {
    const markdownSamples = extractImportedSamplesFromMarkdown(cleanPayload.content, {
      ...options,
      url,
    });

    if (markdownSamples.length) {
      return markdownSamples;
    }
  }

  if (isLikelyXUrl(url)) {
    return [];
  }

  const signal = AbortSignal.timeout(SAMPLE_IMPORT_TIMEOUT_MS);
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to import sample link (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!/html|text\/plain|application\/json/i.test(contentType)) {
    throw new Error(`Unsupported sample link response (${contentType || "unknown"})`);
  }

  const html = await response.text();
  return extractImportedSamplesFromHtml(html, options);
}
