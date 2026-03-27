import { buildStyleProfile, selectReferenceSamples } from "./sample-reference.mjs";
import { formatGenerationTypeLabel, getGenerationTargets, normalizeGenerationType } from "./target-outputs.mjs";

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

function isGenericVisualDescription(value) {
  const text = normalizeInlineText(value).toLowerCase();
  if (!text) {
    return false;
  }

  const visualDescriptionPatterns = [
    /\braise(?:s|d)? one hand\b/,
    /\bover (?:his|her|their) head\b/,
    /\bstanding\b/,
    /\bsitting\b/,
    /\bholding\b/,
    /\bwearing\b/,
    /\blooking at\b/,
    /\bsmiling\b/,
    /\bposing\b/,
    /\bpose\b/,
    /\bclose[- ]?up\b/,
    /\bbackground\b/,
    /\bone (?:man|woman|person|player|character)\b/,
    /\b(?:man|woman|person|player|character) (?:is )?(?:raising|standing|sitting|holding|wearing|looking|smiling)\b/,
  ];

  const hasGenericPattern = visualDescriptionPatterns.some((pattern) => pattern.test(text));
  if (!hasGenericPattern) {
    return false;
  }

  const hasBusinessHint =
    /\b(update|patch|maintenance|event|season|reward|giveaway|battle\s*pass|premium|ticket|bonus|drop|drops|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|login|claim|free)\b/i.test(
      text,
    ) || /[@#]/.test(text) || /\d/.test(text);

  return !hasBusinessHint;
}

function isReadableSignalText(value) {
  const text = normalizeInlineText(value);
  if (!text) {
    return false;
  }

  if (isTechnicalMetadataLine(text)) {
    return false;
  }

  if (isGenericVisualDescription(text)) {
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
        : isReadableSignalText(fallbackSummary)
          ? normalizeInlineText(fallbackSummary)
          : "";

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

function joinSentences(parts = []) {
  return parts
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(value, maxLength) {
  const clean = normalizeInlineText(value);
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength - 1).replace(/\s+\S*$/, "").trimEnd()}…`;
}

function buildFactSentence(prefix, values = [], limit = 3) {
  const picked = dedupe(values).slice(0, limit);
  if (!picked.length) {
    return "";
  }

  return `${prefix}: ${picked.join(" | ")}.`;
}

function buildCoreNarrative({ generationType, assetInsights, trendContext }) {
  const summary = getCopyReadySummary(assetInsights) || assetInsights.keyDetails[0] || assetInsights.visibleText[0] || "";

  if (generationType === "update") {
    return {
      lead: summary || assetInsights.updateItems[0] || "Fresh update details are live.",
      support: buildFactSentence("What is live", assetInsights.updateItems.length ? assetInsights.updateItems : assetInsights.keyDetails),
      reward: buildFactSentence("Rewards", assetInsights.rewards),
      timing: buildFactSentence("Timing", assetInsights.dates, 2),
      details: buildFactSentence("Key details", assetInsights.keyDetails, 3),
    };
  }

  if (generationType === "trending") {
    return {
      lead: summary || trendContext?.summary || "A live trend angle is ready to use.",
      support: trendContext?.summary ? `Trend hook: ${trendContext.summary}` : "",
      reward: buildFactSentence("Game-side detail", assetInsights.keyDetails, 3),
      timing: buildFactSentence("Timing", assetInsights.dates, 2),
      details: buildFactSentence("Visible text", assetInsights.visibleText, 2),
    };
  }

  return {
    lead: summary || "Fresh material is ready.",
    support: buildFactSentence("Key detail", assetInsights.keyDetails, 3),
    reward: buildFactSentence("Highlights", assetInsights.rewards, 3),
    timing: buildFactSentence("Timing", assetInsights.dates, 2),
    details: buildFactSentence("Visible text", assetInsights.visibleText, 2),
  };
}

function buildYoutubeTitle(core) {
  const base = core.lead || core.support || "New update details";
  return truncateAtWord(base.replace(/[.]+$/g, ""), 92);
}

function buildPlatformCopy({ platform, core }) {
  if (platform === "YouTube") {
    return {
      title: buildYoutubeTitle(core),
      body: [
        core.lead,
        joinSentences([core.support, core.reward, core.timing]),
        core.details,
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    };
  }

  if (platform === "Instagram") {
    return {
      title: null,
      body: [
        core.lead,
        joinSentences([core.support, core.reward]),
        core.timing || core.details,
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    };
  }

  if (platform === "TikTok") {
    return {
      title: null,
      body: truncateAtWord(joinSentences([core.lead, core.reward || core.support, core.timing]), 220),
    };
  }

  return {
    title: null,
    body: truncateAtWord(joinSentences([core.lead, core.support || core.reward, core.timing]), 250),
  };
}

function buildPlatformOutputs({ project, generationType, assetInsights, trendContext }) {
  const targets = getGenerationTargets(project);
  const core = buildCoreNarrative({ generationType, assetInsights, trendContext });

  return targets.map((target, index) => {
    const copy = buildPlatformCopy({
      platform: target.platform,
      core,
    });

    return {
      platform: target.platform,
      accountId: target.accountId,
      accountLabel: target.accountLabel,
      candidateIndex: index,
      title: copy.title || null,
      body: copy.body || core.lead || "",
    };
  });
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
  const outputs = buildPlatformOutputs({
    project,
    generationType,
    assetInsights,
    trendContext,
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
    outputs,
  };
}
