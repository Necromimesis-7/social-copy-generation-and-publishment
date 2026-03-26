import { buildStyleProfile, selectReferenceSamples } from "./sample-reference.mjs";

function excerpt(text, maxLength = 140) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) {
    return "";
  }

  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

function toSentenceList(values = []) {
  return values.filter(Boolean).map((value) => `- ${value}`);
}

function dedupe(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeInlineText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[|•]+/g, " ")
    .trim();
}

function isReadableSignalText(value) {
  const text = normalizeInlineText(value);
  if (!text) {
    return false;
  }

  if (isTechnicalMetadataLine(text)) {
    return false;
  }

  const semanticHint = /\b(update|patch|maintenance|event|season|reward|giveaway|battle\s*pass|premium|ticket|bonus|drop|drops|today|tomorrow|weekend|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
    text,
  ) || /\b\d{1,2}:\d{2}\s*(am|pm)\b/i.test(text) || /\b\d{1,2}\/\d{1,2}\b/.test(text);

  const words = text.match(/[A-Za-z]{2,}/g) || [];
  const longerWords = words.filter((word) => word.length >= 4);
  const shortWords = words.filter((word) => word.length <= 2);
  const alphaChars = (text.match(/[A-Za-z]/g) || []).length;
  const vowelChars = (text.match(/[AEIOUaeiou]/g) || []).length;
  const symbolChars = (text.match(/[^A-Za-z0-9\s]/g) || []).length;
  const vowelRatio = vowelChars / Math.max(alphaChars, 1);
  const shortWordRatio = shortWords.length / Math.max(words.length, 1);
  const longWordRatio = longerWords.length / Math.max(words.length, 1);

  if (semanticHint) {
    return true;
  }

  if (words.length < 3) {
    return false;
  }

  if (text.length > 180) {
    return false;
  }

  if (vowelRatio < 0.24) {
    return false;
  }

  if (shortWordRatio > 0.34) {
    return false;
  }

  if (longWordRatio < 0.28) {
    return false;
  }

  if (symbolChars / Math.max(text.length, 1) > 0.18) {
    return false;
  }

  return true;
}

function sanitizeInsightList(values = [], limit = 8) {
  return dedupe(values.map(normalizeInlineText).filter(isReadableSignalText)).slice(0, limit);
}

export function sanitizeAssetInsights(assetInsights = null, fallbackSummary = "") {
  const raw = assetInsights && typeof assetInsights === "object" ? assetInsights : {};
  const mediaBreakdown = dedupe(Array.isArray(raw.mediaBreakdown) ? raw.mediaBreakdown : []);
  const visibleText = sanitizeInsightList(raw.visibleText, 8);
  const keyDetails = sanitizeInsightList(raw.keyDetails, 8);
  const dates = sanitizeInsightList(raw.dates, 6);
  const rewards = sanitizeInsightList(raw.rewards, 6);
  const updateItems = sanitizeInsightList(raw.updateItems, 6);
  const trendClues = sanitizeInsightList(raw.trendClues, 6);
  const summary = isReadableSignalText(raw.summary)
    ? normalizeInlineText(raw.summary)
    : keyDetails.length
      ? `Detected key media details: ${keyDetails.slice(0, 3).join(" | ")}.`
      : visibleText.length
        ? `Detected visible text: ${visibleText.slice(0, 2).join(" | ")}.`
        : fallbackSummary || normalizeInlineText(raw.summary);

  return {
    generationType: raw.generationType || "general",
    summary,
    mediaBreakdown,
    visibleText,
    keyDetails,
    dates,
    rewards,
    updateItems,
    trendClues,
    trendContext: raw.trendContext || null,
  };
}

function collectSignalArray(assets, key) {
  return dedupe(
    assets.flatMap((asset) => {
      const values = asset?.signalInsights?.[key];
      return Array.isArray(values) ? values : [];
    }),
  );
}

function isTechnicalMetadataLine(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return true;
  }

  return (
    /^media metadata only:/.test(text) ||
    /^(image|video)\s+source:/.test(text) ||
    /^\d{2,5}x\d{2,5}(?:\s*[•|-]\s*)?/.test(text) ||
    /^(image|video)\//.test(text) ||
    /\b\d+(\.\d+)?\s*(kb|mb|gb)\b/.test(text) ||
    /\bduration\b/.test(text) ||
    /\bframes extracted\b/.test(text) ||
    /\btranscript skipped\b/.test(text)
  );
}

function normalizeGenerationType(generationType) {
  if (["update", "trending", "general"].includes(generationType)) {
    return generationType;
  }

  return "general";
}

function formatGenerationTypeLabel(generationType) {
  const resolved = normalizeGenerationType(generationType);
  return resolved.charAt(0).toUpperCase() + resolved.slice(1);
}

function buildStyleCue(samples) {
  if (!samples.length) {
    return "No recent post reference text was available.";
  }

  const excerptList = samples
    .slice(0, 3)
    .map((sample) => excerpt(sample.body, 120))
    .filter(Boolean);

  return excerptList.length ? excerptList.join(" | ") : "No recent post reference text was available.";
}

function describeImageAsset(asset) {
  const detail = asset.extractedSummary ? ` • ${asset.extractedSummary}` : "";
  return `${asset.fileName} (${asset.mimeType || "image"})${detail}`;
}

function describeVideoAsset(asset) {
  return `${asset.fileName}${asset.extractedSummary ? ` • ${asset.extractedSummary}` : ""}`;
}

export function buildAssetSummary(assets, assetInsights = null) {
  if (assetInsights?.summary) {
    return assetInsights.summary;
  }

  if (!assets.length) {
    return "No uploaded assets yet";
  }

  const images = assets.filter((asset) => asset.assetType === "image");
  const video = assets.find((asset) => asset.assetType === "video");

  if (video) {
    return `Video source: ${describeVideoAsset(video)}`;
  }

  if (images.length) {
    return `Image source: ${images.map((asset) => describeImageAsset(asset)).join(" | ")}`;
  }

  return "Uploaded assets ready";
}

export function buildFallbackAssetInsights({ assets = [], generationType = "general", trendContext = null }) {
  const images = assets.filter((asset) => asset.assetType === "image");
  const videos = assets.filter((asset) => asset.assetType === "video");
  const signalSummaries = dedupe(assets.map((asset) => asset?.signalInsights?.summary).filter(Boolean));
  const visibleText = dedupe(
    collectSignalArray(assets, "visibleText").concat(
      assets
        .map((asset) => asset.transcriptText || "")
        .filter(Boolean),
    ),
  );
  const keyDetails = dedupe(
    collectSignalArray(assets, "keyDetails").concat(
      assets
        .map((asset) => asset.extractedSummary || "")
        .filter((item) => !isTechnicalMetadataLine(item))
        .filter(Boolean),
    ),
  );
  const summary = signalSummaries[0] || buildAssetSummary(assets);

  return sanitizeAssetInsights({
    generationType: normalizeGenerationType(generationType),
    summary,
    mediaBreakdown: dedupe(
      collectSignalArray(assets, "mediaBreakdown").concat([
        ...images.map((asset) => `Image: ${describeImageAsset(asset)}`),
        ...videos.map((asset) => `Video: ${describeVideoAsset(asset)}`),
      ]),
    ),
    visibleText,
    keyDetails,
    dates: collectSignalArray(assets, "dates"),
    rewards: collectSignalArray(assets, "rewards"),
    updateItems: collectSignalArray(assets, "updateItems"),
    trendClues: dedupe(collectSignalArray(assets, "trendClues").concat(trendContext?.query ? [trendContext.query] : [])),
    trendContext: trendContext
      ? {
          summary: trendContext.summary || "",
          sources: trendContext.sources || [],
        }
      : null,
  }, buildAssetSummary(assets));
}

export function formatAssetInsightSummary(assetInsights, fallbackReason = "") {
  const sections = [assetInsights?.summary || "No extracted asset insights yet"];

  if (assetInsights?.keyDetails?.length) {
    sections.push(`Key details: ${assetInsights.keyDetails.slice(0, 4).join(" | ")}`);
  }

  if (assetInsights?.visibleText?.length) {
    sections.push(`Visible text: ${assetInsights.visibleText.slice(0, 2).join(" | ")}`);
  }

  if (assetInsights?.trendContext?.summary) {
    sections.push(`Trend context: ${assetInsights.trendContext.summary}`);
  }

  if (fallbackReason) {
    sections.push(`Fallback reason: ${fallbackReason}`);
  }

  return sections.join(" • ");
}

export function hasMeaningfulUpdateSignals(assetInsights = null) {
  if (!assetInsights) {
    return false;
  }

  if (assetInsights.dates?.length || assetInsights.rewards?.length || assetInsights.updateItems?.length || assetInsights.visibleText?.length) {
    return true;
  }

  return (assetInsights.keyDetails || []).some((item) => !isTechnicalMetadataLine(item));
}

function getCopyReadySummary(assetInsights) {
  return isReadableSignalText(assetInsights?.summary) ? normalizeInlineText(assetInsights.summary) : "";
}

function buildUpdateCandidates({ samples, assetInsights, styleProfile }) {
  const headline = assetInsights.updateItems[0] || assetInsights.keyDetails[0] || getCopyReadySummary(assetInsights) || "Fresh update details are in.";
  const dateLine = assetInsights.dates.length ? `Dates to note: ${assetInsights.dates.slice(0, 2).join(" | ")}.` : "";
  const rewardLine = assetInsights.rewards.length ? `Rewards in focus: ${assetInsights.rewards.slice(0, 2).join(" | ")}.` : "";
  const detailLines = toSentenceList(assetInsights.keyDetails.slice(0, 3));

  return [
    {
      label: "Update candidate 1",
      body: [
        headline,
        dateLine,
        rewardLine,
        ...detailLines,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      label: "Update candidate 2",
      body: [
        getCopyReadySummary(assetInsights) || "Latest update snapshot is ready.",
        assetInsights.updateItems.length ? `What is changing: ${assetInsights.updateItems.slice(0, 3).join(" | ")}.` : "",
        assetInsights.rewards.length ? `Rewards: ${assetInsights.rewards.slice(0, 3).join(" | ")}.` : "",
        assetInsights.dates.length ? `Timing: ${assetInsights.dates.slice(0, 2).join(" | ")}.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

function buildTrendingCandidates({ samples, assetInsights, trendContext, styleProfile }) {
  const trendLine = trendContext?.summary || "No live trend context was available.";
  const sourceLine = trendContext?.sources?.length
    ? `Reference sources: ${trendContext.sources.slice(0, 3).map((item) => item.title).join(" | ")}`
    : "";
  const copyReadySummary = getCopyReadySummary(assetInsights);

  return [
    {
      label: "Trending candidate 1",
      body: [
        trendLine,
        assetInsights.keyDetails.length ? `Game-side hook: ${assetInsights.keyDetails.slice(0, 3).join(" | ")}` : copyReadySummary,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      label: "Trending candidate 2",
      body: [
        `Trend angle: ${trendLine}`,
        sourceLine,
        assetInsights.visibleText.length ? `Visible asset text: ${assetInsights.visibleText.slice(0, 2).join(" | ")}` : copyReadySummary,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

function buildGeneralCandidates({ samples, assetInsights, styleProfile }) {
  const copyReadySummary = getCopyReadySummary(assetInsights);
  const lead = assetInsights.keyDetails[0] || assetInsights.visibleText[0] || copyReadySummary || "Fresh material is ready.";
  const detailLine = assetInsights.keyDetails.length > 1
    ? assetInsights.keyDetails.slice(1, 4).join(" | ")
    : assetInsights.visibleText.slice(0, 2).join(" | ");

  return [
    {
      label: "General candidate 1",
      body: [
        lead,
        detailLine,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      label: "General candidate 2",
      body: [
        copyReadySummary || lead,
        assetInsights.visibleText.length ? `Visible text: ${assetInsights.visibleText.slice(0, 2).join(" | ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

function buildCandidates({ generationType, samples, assetInsights, trendContext, styleProfile }) {
  const resolved = normalizeGenerationType(generationType);

  if (resolved === "update") {
    return buildUpdateCandidates({ samples, assetInsights, styleProfile });
  }

  if (resolved === "trending") {
    return buildTrendingCandidates({ samples, assetInsights, trendContext, styleProfile });
  }

  return buildGeneralCandidates({ samples, assetInsights, styleProfile });
}

export function buildFallbackDraftPackage({
  project,
  samples,
  assets,
  generationType = "general",
  trendContext = null,
  fallbackReason = "",
  assetInsightsOverride = null,
}) {
  const assetInsights = sanitizeAssetInsights(
    assetInsightsOverride || buildFallbackAssetInsights({ assets, generationType, trendContext }),
    buildAssetSummary(assets),
  );

  if (normalizeGenerationType(generationType) === "update" && !hasMeaningfulUpdateSignals(assetInsights)) {
    const error = new Error(
      "Update mode needs real update facts from the uploaded asset, such as dates, rewards, visible text, or named update items.",
    );
    error.statusCode = 400;
    throw error;
  }

  const referenceSamples = selectReferenceSamples({
    samples,
    generationType,
    assetInsights,
    trendContext,
    limit: 5,
  });
  const styleProfile = buildStyleProfile(referenceSamples);
  const candidates = buildCandidates({
    generationType,
    samples: referenceSamples,
    assetInsights,
    trendContext,
    styleProfile,
  });

  return {
    provider: "fallback",
    generationType: normalizeGenerationType(generationType),
    title: `${formatGenerationTypeLabel(generationType)} draft for ${project.name}`,
    assetMode: assets.some((asset) => asset.assetType === "video")
      ? "single_video"
      : assets.some((asset) => asset.assetType === "image")
        ? "multi_image"
        : "none",
    assetSummary: formatAssetInsightSummary(assetInsights, fallbackReason),
    assetInsights,
    sampleCount: referenceSamples.length,
    outputs: candidates.map((candidate, index) => ({
      platform: "general",
      accountId: null,
      accountLabel: "",
      candidateIndex: index,
      title: null,
      body: candidate.body,
    })),
  };
}
