import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildAssetSummary,
  buildFallbackDraftPackage,
  formatAssetInsightSummary,
  hasMeaningfulUpdateSignals,
} from "./fallback-generator.mjs";
import { buildStyleProfile, selectReferenceSamples } from "./sample-reference.mjs";

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const OPENAI_VISUAL_INPUT_LIMIT = Math.max(4, Number(process.env.OPENAI_VISUAL_INPUT_LIMIT || 12));
const OPENAI_REQUEST_TIMEOUT_MS = Math.max(10000, Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 45000));
const hasSips = existsSync("/usr/bin/sips");

function runCommandSilently(command, args) {
  execFileSync(command, args, {
    stdio: "ignore",
  });
}

function excerpt(text, maxLength = 320) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) {
    return "";
  }

  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

function buildSamplesSection(samples) {
  if (!samples.length) {
    return "No recent post samples were provided.";
  }

  return samples
    .slice(0, 20)
    .map(
      (sample, index) =>
        `${index + 1}. Platform: ${sample.platform}; Mode: ${sample.mode}; Date: ${sample.publishedAt || "unknown"}; Text: ${excerpt(
          sample.body,
          420,
        )}`,
    )
    .join("\n");
}

function buildStyleProfileSection(styleProfile) {
  if (!styleProfile) {
    return "No style profile available.";
  }

  return [
    styleProfile.summary || "No style profile available.",
    ...(styleProfile.signals || []),
    ...(styleProfile.openingExamples?.length
      ? [`Opening examples: ${styleProfile.openingExamples.join(" | ")}`]
      : []),
  ].join("\n");
}

function buildVisionPreviewPath(absolutePath, generationType, fallbackMimeType) {
  if (!hasSips) {
    return {
      path: absolutePath,
      cleanupDir: null,
      mimeType: fallbackMimeType || "image/jpeg",
    };
  }

  const tempDir = mkdtempSync(join(tmpdir(), "codex-vision-"));
  const previewPath = join(tempDir, generationType === "update" ? "vision-update.jpg" : "vision-preview.jpg");
  const maxSide = generationType === "update" ? "1440" : "1200";

  try {
    runCommandSilently("/usr/bin/sips", [
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      "75",
      "-Z",
      maxSide,
      absolutePath,
      "--out",
      previewPath,
    ]);

    return existsSync(previewPath)
      ? {
          path: previewPath,
          cleanupDir: tempDir,
          mimeType: "image/jpeg",
        }
      : {
          path: absolutePath,
          cleanupDir: tempDir,
          mimeType: fallbackMimeType || "image/jpeg",
        };
  } catch {
    rmSync(tempDir, { recursive: true, force: true });
    return {
      path: absolutePath,
      cleanupDir: null,
      mimeType: fallbackMimeType || "image/jpeg",
    };
  }
}

function appendImageInput(items, uploadsRoot, imageAsset, generationType) {
  const absolutePath = join(uploadsRoot, imageAsset.storagePath);
  if (!existsSync(absolutePath)) {
    return;
  }

  const previewFile = buildVisionPreviewPath(absolutePath, generationType, imageAsset.mimeType);

  try {
    const base64 = readFileSync(previewFile.path, "base64");
    items.push({
      type: "input_image",
      image_url: `data:${previewFile.mimeType};base64,${base64}`,
      detail: generationType === "update" ? "high" : "auto",
    });
  } finally {
    if (previewFile.cleanupDir) {
      rmSync(previewFile.cleanupDir || dirname(previewFile.path), { recursive: true, force: true });
    }
  }
}

function createImageInputItems(assets, uploadsRoot, generationType) {
  const items = [];

  assets.forEach((asset) => {
    if (asset.assetType === "image") {
      appendImageInput(items, uploadsRoot, asset, generationType);
      return;
    }

    if (asset.assetType === "video") {
      (asset.derivedImages || []).forEach((frame) => {
        appendImageInput(items, uploadsRoot, frame, generationType);
      });
    }
  });

  return items.slice(0, OPENAI_VISUAL_INPUT_LIMIT);
}

function buildMediaNote(assets) {
  if (!assets.length) {
    return "No assets were uploaded.";
  }

  return assets
    .map((asset) => {
      if (asset.assetType === "video") {
        return `Video: ${asset.fileName}. ${asset.extractedSummary || ""} ${asset.transcriptText ? `Transcript: ${excerpt(asset.transcriptText, 220)}` : ""}`.trim();
      }

      return `Image: ${asset.fileName}. ${asset.extractedSummary || "Use the image contents directly."}`.trim();
    })
    .join("\n");
}

function buildAssetInsightSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      media_breakdown: {
        type: "array",
        items: { type: "string" },
      },
      visible_text: {
        type: "array",
        items: { type: "string" },
      },
      key_details: {
        type: "array",
        items: { type: "string" },
      },
      dates: {
        type: "array",
        items: { type: "string" },
      },
      rewards: {
        type: "array",
        items: { type: "string" },
      },
      update_items: {
        type: "array",
        items: { type: "string" },
      },
      trend_clues: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["summary", "media_breakdown", "visible_text", "key_details", "dates", "rewards", "update_items", "trend_clues"],
  };
}

function buildGenerationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      general_candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            body: { type: "string" },
          },
          required: ["label", "body"],
        },
      },
    },
    required: ["general_candidates"],
  };
}

function buildRequestEnvelope(inputText, imageItems) {
  return [
    {
      role: "system",
      content:
        "You are a senior overseas social media strategist. Produce crisp, usable English copy without meta commentary.",
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: inputText,
        },
        ...imageItems,
      ],
    },
  ];
}

async function callResponsesJson({ schemaName, schema, inputText, assets, uploadsRoot, signal, maxOutputTokens, generationType }) {
  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: buildRequestEnvelope(inputText, createImageInputItems(assets, uploadsRoot, generationType)),
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || "OpenAI request failed.");
    error.statusCode = response.status;
    throw error;
  }

  const outputText = extractOutputText(payload);
  return JSON.parse(outputText);
}

function extractOutputText(responsePayload) {
  if (typeof responsePayload.output_text === "string" && responsePayload.output_text.trim()) {
    return responsePayload.output_text;
  }

  for (const outputItem of responsePayload.output || []) {
    for (const contentItem of outputItem.content || []) {
      if (contentItem.type === "refusal") {
        throw new Error(contentItem.refusal || "The model refused to generate this response.");
      }

      if (contentItem.type === "output_text" && contentItem.text) {
        return contentItem.text;
      }
    }
  }

  throw new Error("No text output was returned by OpenAI.");
}

function normalizeInsights(parsed, generationType, trendContext) {
  return {
    generationType,
    summary: String(parsed.summary || "").trim(),
    mediaBreakdown: Array.isArray(parsed.media_breakdown) ? parsed.media_breakdown.filter(Boolean) : [],
    visibleText: Array.isArray(parsed.visible_text) ? parsed.visible_text.filter(Boolean) : [],
    keyDetails: Array.isArray(parsed.key_details) ? parsed.key_details.filter(Boolean) : [],
    dates: Array.isArray(parsed.dates) ? parsed.dates.filter(Boolean) : [],
    rewards: Array.isArray(parsed.rewards) ? parsed.rewards.filter(Boolean) : [],
    updateItems: Array.isArray(parsed.update_items) ? parsed.update_items.filter(Boolean) : [],
    trendClues: Array.isArray(parsed.trend_clues) ? parsed.trend_clues.filter(Boolean) : [],
    trendContext: trendContext
      ? {
          summary: trendContext.summary || "",
          sources: trendContext.sources || [],
        }
      : null,
  };
}

function formatGenerationModeInstructions(generationType, trendContext) {
  if (generationType === "update") {
    return [
      "Generation type: update.",
      "The copy must include every concrete date, time, reward, patch item, or event detail that is visible or confirmed in the extracted asset insights.",
      "Do not invent missing details.",
      "Use the recent post library as the writing pattern reference for update-style posts.",
    ].join("\n");
  }

  if (generationType === "trending") {
    return [
      "Generation type: trending.",
      "Use the live trend research results below as the only confirmed trend context.",
      "Blend the live trend with the game-side material extracted from the assets.",
      "Do not reference a trend that is not supported by the live search results.",
      trendContext?.summary ? `Live trend summary: ${trendContext.summary}` : "Live trend summary: unavailable",
      trendContext?.sources?.length
        ? `Live trend sources: ${trendContext.sources
            .slice(0, 4)
            .map((item) => `${item.title} (${item.url})`)
            .join(" | ")}`
        : "Live trend sources: unavailable",
    ].join("\n");
  }

  return [
    "Generation type: general.",
    "Use the recent post library as the primary writing pattern reference.",
    "Use the extracted asset insights to decide what the new post should actually say.",
  ].join("\n");
}

function buildAssetInsightInput({ assets, generationType }) {
  return [
    "Inspect the uploaded assets and return only confirmed facts in structured JSON.",
    "Focus on visible text, dates, rewards, update items, and key game-side details.",
    "Do not infer extra context that is not visible or directly supported by the assets.",
    `Requested generation type: ${generationType}.`,
    "",
    "Known media metadata:",
    buildMediaNote(assets),
  ].join("\n");
}

function buildGenerationInput({ samples, assetInsights, generationType, trendContext, styleProfile }) {
  return [
    "Write English social copy using only these two sources of truth:",
    "1. Approved recent post references for writing style and structural reference.",
    "2. Extracted asset insights for the actual new information that must be covered.",
    "Do not use project settings or account setup as generation inputs.",
    "Do not mention being an AI, the prompt, or missing context.",
    "",
    formatGenerationModeInstructions(generationType, trendContext),
    "",
    "Recent post library:",
    buildSamplesSection(samples),
    "",
    "Style profile inferred from approved samples:",
    buildStyleProfileSection(styleProfile),
    "",
    "Extracted asset insights:",
    JSON.stringify(assetInsights, null, 2),
    "",
    "Return only structured content.",
  ].join("\n");
}

function mergeWithFallback({ fallbackPackage, parsed }) {
  const generalCandidates = Array.isArray(parsed.general_candidates)
    ? parsed.general_candidates.filter((item) => item?.body)
    : [];
  const fallbackGeneral = fallbackPackage.outputs.filter((item) => item.platform === "general");
  const finalGeneral = generalCandidates.length ? generalCandidates : fallbackGeneral;

  return finalGeneral.slice(0, 3).map((candidate, index) => ({
    platform: "general",
    accountId: null,
    accountLabel: "",
    candidateIndex: index,
    title: null,
    body: candidate.body,
  }));
}

export async function generateDraftPackageWithOpenAI({
  project,
  samples,
  assets,
  uploadsRoot,
  generationType = "general",
  trendContext = null,
  signal,
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const rawInsights = await callResponsesJson({
    schemaName: "asset_insights",
    schema: buildAssetInsightSchema(),
    inputText: buildAssetInsightInput({ assets, generationType }),
    assets,
    uploadsRoot,
    signal,
    maxOutputTokens: 1400,
    generationType,
  });

  const assetInsights = normalizeInsights(rawInsights, generationType, trendContext);

  if (generationType === "update" && !hasMeaningfulUpdateSignals(assetInsights)) {
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

  const parsedCopy = await callResponsesJson({
    schemaName: "templated_social_copy",
    schema: buildGenerationSchema(),
    inputText: buildGenerationInput({
      samples: referenceSamples,
      assetInsights,
      generationType,
      trendContext,
      styleProfile,
    }),
    assets,
    uploadsRoot,
    signal,
    maxOutputTokens: 2200,
    generationType,
  });

  const fallbackPackage = buildFallbackDraftPackage({
    project,
    samples,
    assets,
    generationType,
    trendContext,
    assetInsightsOverride: assetInsights,
  });

  return {
    provider: "openai",
    generationType,
    title: `${generationType.charAt(0).toUpperCase() + generationType.slice(1)} draft for ${project.name}`,
    assetMode: fallbackPackage.assetMode,
    assetSummary: formatAssetInsightSummary(assetInsights),
    assetInsights,
    sampleCount: referenceSamples.length,
    outputs: mergeWithFallback({ fallbackPackage, parsed: parsedCopy }),
  };
}
