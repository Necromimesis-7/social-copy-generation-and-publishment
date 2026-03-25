const SEARCH_TIMEOUT_MS = Math.max(5000, Number(process.env.TREND_SEARCH_TIMEOUT_MS || 12000));

const STOP_WORDS = new Set([
  "about",
  "after",
  "around",
  "because",
  "between",
  "caption",
  "content",
  "context",
  "details",
  "english",
  "first",
  "from",
  "game",
  "general",
  "guide",
  "latest",
  "media",
  "recent",
  "reference",
  "reward",
  "social",
  "source",
  "summary",
  "text",
  "that",
  "their",
  "there",
  "these",
  "this",
  "those",
  "through",
  "update",
  "using",
  "video",
  "with",
]);

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9+#.-]{2,}/g) || [];
}

function scoreTokens(text) {
  const counts = new Map();
  tokenize(text).forEach((token) => {
    if (STOP_WORDS.has(token) || /^\d+$/.test(token)) {
      return;
    }

    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([token]) => token);
}

function buildSearchQuery({ samples = [], assets = [] }) {
  const sampleText = samples
    .slice(0, 8)
    .map((sample) => sample.body || "")
    .join(" ");

  const assetText = assets
    .map((asset) => [asset.fileName, asset.extractedSummary, asset.transcriptText].filter(Boolean).join(" "))
    .join(" ");

  const rankedTokens = scoreTokens(`${sampleText} ${assetText}`).slice(0, 6);
  if (!rankedTokens.length) {
    return "";
  }

  return `${rankedTokens.join(" ")} social media trend`;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseDuckDuckGoResults(html) {
  const results = [];
  const blockPattern = /<div class="result(?:.|\n|\r)*?<\/div>\s*<\/div>/gi;

  for (const match of html.matchAll(blockPattern)) {
    const block = match[0];
    const titleMatch = block.match(/result__a[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/result__snippet[^>]*>([\s\S]*?)<\/a?>/i);
    const urlMatch = block.match(/result__a[^>]*href="([^"]+)"/i);
    const title = normalizeText(decodeHtml(titleMatch?.[1] || ""));
    const snippet = normalizeText(decodeHtml(snippetMatch?.[1] || ""));
    const url = decodeHtml(urlMatch?.[1] || "");

    if (!title || !url) {
      continue;
    }

    results.push({ title, snippet, url });
    if (results.length >= 5) {
      break;
    }
  }

  return results;
}

function buildTrendSummary(query, sources) {
  if (!sources.length) {
    return "";
  }

  const first = sources[0];
  const snippet = first.snippet ? ` ${first.snippet}` : "";
  return `Search query "${query}" suggests the live trend is around ${first.title}.${snippet}`.trim();
}

export async function researchTrendingContext({ samples = [], assets = [], signal } = {}) {
  const query = buildSearchQuery({ samples, assets });
  if (!query) {
    return null;
  }

  const searchSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]) : AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    method: "GET",
    signal: searchSignal,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const sources = parseDuckDuckGoResults(html);
  if (!sources.length) {
    return null;
  }

  return {
    query,
    summary: buildTrendSummary(query, sources),
    sources,
  };
}

