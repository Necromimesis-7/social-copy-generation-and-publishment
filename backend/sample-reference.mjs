function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeSampleType(value) {
  return ["update", "trending", "general"].includes(value) ? value : "general";
}

export function normalizeReviewStatus(value) {
  return ["accepted", "pending", "rejected"].includes(value) ? value : "pending";
}

function tokenize(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9+#.-]{2,}/g) || [];
}

function buildSignalText({ assetInsights = null, trendContext = null, generationType = "general" }) {
  const parts = [generationType];

  if (assetInsights?.summary) {
    parts.push(assetInsights.summary);
  }

  [
    assetInsights?.mediaBreakdown,
    assetInsights?.visibleText,
    assetInsights?.keyDetails,
    assetInsights?.dates,
    assetInsights?.rewards,
    assetInsights?.updateItems,
    assetInsights?.trendClues,
  ]
    .flat()
    .filter(Boolean)
    .forEach((item) => parts.push(item));

  if (trendContext?.summary) {
    parts.push(trendContext.summary);
  }

  return parts.join(" ");
}

function overlapScore(sampleBody, signalTokens) {
  if (!signalTokens.size) {
    return 0;
  }

  const sampleTokens = new Set(tokenize(sampleBody));
  let score = 0;
  signalTokens.forEach((token) => {
    if (sampleTokens.has(token)) {
      score += 1;
    }
  });
  return score;
}

function recencyScore(sample) {
  const timestamp = new Date(sample.publishedAt || sample.createdAt || 0).getTime();
  if (!timestamp || Number.isNaN(timestamp)) {
    return 0;
  }

  const ageDays = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (ageDays <= 7) {
    return 3;
  }
  if (ageDays <= 30) {
    return 2;
  }
  if (ageDays <= 90) {
    return 1;
  }
  return 0;
}

function typeAffinity(sampleType, generationType) {
  if (sampleType === generationType) {
    return 10;
  }
  if (sampleType === "general") {
    return 4;
  }
  return 0;
}

export function selectReferenceSamples({
  samples = [],
  generationType = "general",
  assetInsights = null,
  trendContext = null,
  limit = 5,
}) {
  const normalizedType = normalizeSampleType(generationType);
  const signalTokens = new Set(tokenize(buildSignalText({ assetInsights, trendContext, generationType: normalizedType })));

  return [...samples]
    .filter((sample) => normalizeReviewStatus(sample.reviewStatus) === "accepted")
    .map((sample, index) => ({
      sample,
      score:
        typeAffinity(normalizeSampleType(sample.sampleType), normalizedType) +
        overlapScore(sample.body, signalTokens) +
        recencyScore(sample) -
        index * 0.001,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.sample);
}

function rateFrequency(count, total) {
  if (!total || count === 0) {
    return "rare";
  }

  const ratio = count / total;
  if (ratio >= 0.66) {
    return "common";
  }
  if (ratio >= 0.33) {
    return "occasional";
  }
  return "rare";
}

export function buildStyleProfile(samples = []) {
  if (!samples.length) {
    return {
      summary: "No approved style samples were available.",
      signals: [],
    };
  }

  const bodies = samples.map((sample) => normalizeWhitespace(sample.body)).filter(Boolean);
  const total = bodies.length;
  const averageWords = Math.round(
    bodies.reduce((sum, body) => sum + body.split(/\s+/).filter(Boolean).length, 0) / Math.max(total, 1),
  );
  const averageLines = Math.round(
    bodies.reduce((sum, body) => sum + String(body).split("\n").filter((line) => line.trim()).length, 0) / Math.max(total, 1),
  );
  const hashtagCount = bodies.filter((body) => /#[a-z0-9_]+/i.test(body)).length;
  const emojiCount = bodies.filter((body) => /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(body)).length;
  const ctaCount = bodies.filter((body) => /\b(join|play|watch|grab|get|tap|drop|claim|check out|learn more)\b/i.test(body)).length;
  const questionCount = bodies.filter((body) => /\?/.test(body)).length;
  const openingWords = bodies
    .map((body) => body.split(/\s+/).slice(0, 6).join(" "))
    .slice(0, 5);

  const signals = [
    averageWords <= 18 ? "Short copy is common." : averageWords <= 40 ? "Medium-length copy is common." : "Longer copy is common.",
    averageLines > 1 ? "Line breaks are used regularly." : "Most posts stay in a single paragraph.",
    `Hashtags are ${rateFrequency(hashtagCount, total)}.`,
    `CTA language is ${rateFrequency(ctaCount, total)}.`,
    `Questions are ${rateFrequency(questionCount, total)}.`,
    `Emoji usage is ${rateFrequency(emojiCount, total)}.`,
  ];

  return {
    summary: `Reference set uses about ${averageWords} words and ${averageLines} line${averageLines === 1 ? "" : "s"} per post on average.`,
    signals,
    openingExamples: openingWords,
  };
}
