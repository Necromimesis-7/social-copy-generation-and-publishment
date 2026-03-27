import {
  buildFallbackAssetInsights,
  buildFallbackDraftPackage,
  formatAssetInsightSummary,
  hasMeaningfulUpdateSignals,
  sanitizeAssetInsights,
} from "./fallback-generator.mjs";
import { buildStyleProfile, selectReferenceSamples } from "./sample-reference.mjs";
import {
  buildTargetListText,
  formatGenerationTypeLabel,
  getGenerationTargets,
  getTargetKey,
} from "./target-outputs.mjs";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL || "https://ai.leihuo.netease.com/v1";
const GATEWAY_MODEL = process.env.GATEWAY_MODEL || "gpt-5.4";
const GATEWAY_REQUEST_TIMEOUT_MS = Math.max(10000, Number(process.env.GATEWAY_REQUEST_TIMEOUT_MS || 45000));
const GATEWAY_VISUAL_INPUT_LIMIT = Math.max(1, Number(process.env.GATEWAY_VISUAL_INPUT_LIMIT || process.env.OPENAI_VISUAL_INPUT_LIMIT || 8));
const hasSips = existsSync("/usr/bin/sips");

function runCommandSilently(command, args) {
  execFileSync(command, args, {
    stdio: "ignore",
  });
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function excerpt(text, maxLength = 320) {
  const clean = normalizeWhitespace(text);
  if (!clean) {
    return "";
  }

  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

function buildSamplesSection(samples) {
  if (!samples.length) {
    return "No approved recent post samples were available.";
  }

  return samples
    .slice(0, 5)
    .map(
      (sample, index) =>
        `${index + 1}. Type: ${sample.sampleType || "general"}; Date: ${sample.publishedAt || "unknown"}; Text: ${excerpt(
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

  const tempDir = mkdtempSync(join(tmpdir(), "gateway-vision-"));
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
      type: "image_url",
      image_url: {
        url: `data:${previewFile.mimeType};base64,${base64}`,
        detail: generationType === "update" ? "high" : "auto",
      },
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

  return items.slice(0, GATEWAY_VISUAL_INPUT_LIMIT);
}

function formatGenerationModeInstructions(generationType, trendContext) {
  if (generationType === "update") {
    return [
      "Generation type: update.",
      "Carry forward every confirmed date, time, reward, patch item, event name, or update detail from the extracted asset signals.",
      "Do not invent missing facts.",
      "Write in the same style patterns shown in the approved recent post library.",
    ].join("\n");
  }

  if (generationType === "trending") {
    return [
      "Generation type: trending.",
      "Use the live trend research below as the only confirmed trend context.",
      "Blend the confirmed trend with the extracted game-side asset signals.",
      "Do not mention any trend that is not supported by the research results.",
      trendContext?.summary ? `Live trend summary: ${trendContext.summary}` : "Live trend summary: unavailable.",
      trendContext?.sources?.length
        ? `Live trend sources: ${trendContext.sources
            .slice(0, 4)
            .map((item) => `${item.title} (${item.url})`)
            .join(" | ")}`
        : "Live trend sources: unavailable.",
    ].join("\n");
  }

  return [
    "Generation type: general.",
    "Use the approved recent post library as the primary writing pattern reference.",
    "Use the extracted asset signals to decide what the new post should actually say.",
  ].join("\n");
}

function buildGenerationPrompt({ samples, assetInsights, generationType, trendContext, styleProfile, targets }) {
  return [
    "You are writing English social copy for a game brand.",
    "Use only these sources of truth:",
    "1. Approved recent post references for style and structure.",
    "2. Extracted asset signals for the actual new facts.",
    "Do not mention prompts, policies, missing context, or that you are an AI.",
    "Return valid JSON only. No markdown fences.",
    "",
    "JSON schema:",
    '{ "platform_outputs": [ { "platform": "X", "account_label": "@brand", "title": null, "body": "..." } ] }',
    "",
    "Requirements:",
    "- Return exactly one output item for each target channel listed below.",
    "- Keep the same channel order as the target list.",
    "- For YouTube, return both title and body.",
    "- For every other platform, set title to null and return one publishable body.",
    "- Keep the language natural and specific.",
    "- Do not include explanations outside the JSON.",
    "",
    "Target channels:",
    buildTargetListText(targets),
    "",
    formatGenerationModeInstructions(generationType, trendContext),
    "",
    "Approved recent post library:",
    buildSamplesSection(samples),
    "",
    "Style profile inferred from approved samples:",
    buildStyleProfileSection(styleProfile),
    "",
    "Extracted asset signals:",
    JSON.stringify(assetInsights, null, 2),
  ].join("\n");
}

function buildAssetInsightPrompt({ assets, generationType }) {
  return [
    "Inspect the uploaded media and return only confirmed facts in valid JSON.",
    "Focus on visible text, dates, rewards, update items, and key game-side details.",
    "Do not infer facts that are not visible or directly supported by the assets.",
    "Do not describe poses, gestures, clothing, framing, or generic human appearance unless that detail is explicitly the point of the post.",
    "If the media only shows generic character poses or scene composition without clear business-relevant facts, leave the detail arrays empty and keep the summary neutral.",
    "Return valid JSON only. No markdown fences.",
    "",
    "JSON schema:",
    '{ "summary": "...", "media_breakdown": ["..."], "visible_text": ["..."], "key_details": ["..."], "dates": ["..."], "rewards": ["..."], "update_items": ["..."], "trend_clues": ["..."] }',
    "",
    `Requested generation type: ${generationType}.`,
    "",
    "Known media metadata:",
    ...assets.map((asset) => `- ${asset.fileName}: ${asset.extractedSummary || "No local summary available."}`),
  ].join("\n");
}

function buildRequestBody(prompt, imageItems = []) {
  return {
    model: GATEWAY_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a senior overseas social media strategist. Output valid JSON only.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          ...imageItems,
        ],
      },
    ],
    temperature: 0.4,
    max_tokens: 2200,
  };
}

function extractMessageText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((item) => (typeof item === "string" ? item : item?.text || ""))
      .join("\n")
      .trim();
    if (joined) {
      return joined;
    }
  }

  throw new Error("No text output was returned by the gateway model.");
}

function stripCodeFences(text) {
  const clean = String(text || "").trim();
  if (clean.startsWith("```")) {
    return clean.replace(/^```[a-z0-9_-]*\s*/i, "").replace(/```$/i, "").trim();
  }
  return clean;
}

function findJsonObject(text) {
  const clean = stripCodeFences(text);
  const direct = clean.match(/\{[\s\S]*\}/);
  if (!direct) {
    throw new Error("The gateway model did not return a JSON object.");
  }

  return direct[0];
}

function parseJsonObject(text) {
  const raw = findJsonObject(text);
  return JSON.parse(raw);
}

function mergeWithFallback({ targets, fallbackPackage, parsed }) {
  const parsedOutputs = Array.isArray(parsed.platform_outputs)
    ? parsed.platform_outputs.filter((item) => item?.platform && item?.body)
    : [];
  const parsedByKey = new Map(parsedOutputs.map((item) => [getTargetKey({ platform: item.platform, accountLabel: item.account_label }), item]));
  const parsedByPlatform = new Map(parsedOutputs.map((item) => [item.platform, item]));
  const fallbackByKey = new Map(
    (fallbackPackage.outputs || []).map((item) => [getTargetKey({ platform: item.platform, accountLabel: item.accountLabel, accountId: item.accountId }), item]),
  );

  return targets.map((target, index) => {
    const source =
      parsedByKey.get(getTargetKey(target))
      || (targets.filter((item) => item.platform === target.platform).length === 1 ? parsedByPlatform.get(target.platform) : null)
      || fallbackByKey.get(getTargetKey(target));

    return {
      platform: target.platform,
      accountId: target.accountId,
      accountLabel: target.accountLabel,
      candidateIndex: index,
      title: target.platform === "YouTube" ? source?.title || null : null,
      body: source?.body || "",
    };
  }).filter((item) => item.body);
}

function normalizeInsights(parsed, generationType, trendContext) {
  return sanitizeAssetInsights({
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
  });
}

async function callGatewayJson({ prompt, signal, assets = [], uploadsRoot = "", generationType = "general" }) {
  const response = await fetch(`${GATEWAY_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.GATEWAY_API_KEY}`,
    },
    body: JSON.stringify(buildRequestBody(prompt, uploadsRoot ? createImageInputItems(assets, uploadsRoot, generationType) : [])),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(GATEWAY_REQUEST_TIMEOUT_MS)])
      : AbortSignal.timeout(GATEWAY_REQUEST_TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || payload.message || "Gateway model request failed.");
    error.statusCode = response.status;
    throw error;
  }

  return parseJsonObject(extractMessageText(payload));
}

export async function generateDraftPackageWithGateway({
  project,
  samples,
  assets,
  uploadsRoot,
  generationType = "general",
  trendContext = null,
  signal,
}) {
  if (!process.env.GATEWAY_API_KEY) {
    throw new Error("GATEWAY_API_KEY is not set.");
  }

  const targets = getGenerationTargets(project);
  if (!targets.length) {
    const error = new Error("Sync a Metricool brand with at least one supported channel before generating copy.");
    error.statusCode = 400;
    throw error;
  }

  let assetInsights = buildFallbackAssetInsights({ assets, generationType, trendContext });

  if (uploadsRoot && assets.length) {
    try {
      const parsedInsights = await callGatewayJson({
        prompt: buildAssetInsightPrompt({ assets, generationType }),
        signal,
        assets,
        uploadsRoot,
        generationType,
      });
      assetInsights = normalizeInsights(parsedInsights, generationType, trendContext);
    } catch (error) {
      if (error?.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        throw error;
      }
      // Non-user errors can fall back to local extraction.
    }
  }

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
  const parsedCopy = await callGatewayJson({
    prompt: buildGenerationPrompt({
      samples: referenceSamples,
      assetInsights,
      generationType,
      trendContext,
      styleProfile,
      targets,
    }),
    signal,
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
    provider: "gateway",
    generationType,
    title: `${formatGenerationTypeLabel(generationType)} draft for ${project.name}`,
    assetMode: fallbackPackage.assetMode,
    assetSummary: formatAssetInsightSummary(assetInsights),
    assetInsights,
    sampleCount: referenceSamples.length,
    outputs: mergeWithFallback({ targets, fallbackPackage, parsed: parsedCopy }),
  };
}
