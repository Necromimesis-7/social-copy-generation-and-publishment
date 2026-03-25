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

  return {
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
  };
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

function buildUpdateCandidates({ samples, assetInsights, styleProfile }) {
  const sampleLead = samples[0]?.body ? excerpt(samples[0].body, 180) : "";
  const factualLines = [
    ...toSentenceList(assetInsights.dates),
    ...toSentenceList(assetInsights.updateItems),
    ...toSentenceList(assetInsights.rewards),
    ...toSentenceList(assetInsights.keyDetails.slice(0, 4)),
  ];

  return [
    {
      label: "Update candidate 1",
      body: [
        sampleLead ? `Reference tone: ${sampleLead}` : "",
        styleProfile?.summary ? `Style profile: ${styleProfile.summary}` : "",
        "Update format:",
        ...factualLines,
        assetInsights.visibleText.length ? `Visible text reference: ${assetInsights.visibleText.slice(0, 2).join(" | ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      label: "Update candidate 2",
      body: [
        "Latest update snapshot:",
        assetInsights.summary,
        assetInsights.keyDetails.length ? `Confirmed details: ${assetInsights.keyDetails.slice(0, 5).join(" | ")}` : "",
        assetInsights.rewards.length ? `Rewards: ${assetInsights.rewards.join(" | ")}` : "",
        assetInsights.dates.length ? `Timing: ${assetInsights.dates.join(" | ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

function buildTrendingCandidates({ samples, assetInsights, trendContext, styleProfile }) {
  const styleCue = buildStyleCue(samples);
  const trendLine = trendContext?.summary || "No live trend context was available.";
  const sourceLine = trendContext?.sources?.length
    ? `Reference sources: ${trendContext.sources.slice(0, 3).map((item) => item.title).join(" | ")}`
    : "";

  return [
    {
      label: "Trending candidate 1",
      body: [
        `Live trend hook: ${trendLine}`,
        styleProfile?.summary ? `Style profile: ${styleProfile.summary}` : "",
        `Game-side details: ${assetInsights.keyDetails.slice(0, 4).join(" | ") || assetInsights.summary}`,
        `Recent post style cues: ${styleCue}`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      label: "Trending candidate 2",
      body: [
        `Trend angle: ${trendLine}`,
        sourceLine,
        assetInsights.visibleText.length ? `Visible asset text: ${assetInsights.visibleText.slice(0, 2).join(" | ")}` : "",
        assetInsights.summary,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

function buildGeneralCandidates({ samples, assetInsights, styleProfile }) {
  const sampleLead = samples[0]?.body ? excerpt(samples[0].body, 180) : "";
  const styleCue = buildStyleCue(samples);

  return [
    {
      label: "General candidate 1",
      body: [
        sampleLead ? `Reference tone: ${sampleLead}` : "",
        styleProfile?.summary ? `Style profile: ${styleProfile.summary}` : "",
        `Asset insight: ${assetInsights.summary}`,
        assetInsights.keyDetails.length ? `Key details: ${assetInsights.keyDetails.slice(0, 4).join(" | ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      label: "General candidate 2",
      body: [
        `Recent post style cues: ${styleCue}`,
        assetInsights.visibleText.length ? `Visible text: ${assetInsights.visibleText.slice(0, 2).join(" | ")}` : "",
        assetInsights.summary,
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
  const assetInsights = assetInsightsOverride || buildFallbackAssetInsights({ assets, generationType, trendContext });

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
