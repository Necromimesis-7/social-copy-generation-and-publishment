import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
const OPENAI_TRANSCRIPTION_MAX_BYTES = Number(process.env.OPENAI_TRANSCRIPTION_MAX_BYTES || 25 * 1024 * 1024);
const MAX_VIDEO_FRAMES = Math.max(3, Number(process.env.MAX_VIDEO_FRAMES || 12));

const directTranscriptionExtensions = new Set([".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm"]);

function commandAvailable(command) {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const hasFfmpeg = commandAvailable("ffmpeg");
const hasFfprobe = commandAvailable("ffprobe");
const hasQuickLook = existsSync("/usr/bin/qlmanage");
const hasMdls = existsSync("/usr/bin/mdls");
const hasSips = existsSync("/usr/bin/sips");
const hasTesseract = commandAvailable("tesseract");

function dedupeStrings(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function resolveMediaSignalsScript() {
  const candidates = [
    process.env.MEDIA_SIGNALS_SCRIPT_PATH,
    join(process.cwd(), "local-skills", "media-signals", "scripts", "extract_media_signals.py"),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function runCommand(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function runCommandSilently(command, args) {
  execFileSync(command, args, {
    stdio: "ignore",
  });
}

function readMdlsNumber(name, absolutePath) {
  if (!hasMdls) {
    return null;
  }

  try {
    const raw = runCommand("/usr/bin/mdls", ["-raw", "-name", name, absolutePath]);
    const clean = raw.replace(/^"+|"+$/g, "").trim();
    if (!clean || clean === "(null)") {
      return null;
    }

    const value = Number(clean);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function getVideoMetadata(absolutePath) {
  if (hasFfprobe) {
    try {
      const raw = runCommand("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,duration",
        "-of",
        "json",
        absolutePath,
      ]);
      const payload = JSON.parse(raw);
      const stream = payload.streams?.[0] || {};
      const durationSeconds = Number(stream.duration);
      return {
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        width: Number.isFinite(Number(stream.width)) ? Number(stream.width) : null,
        height: Number.isFinite(Number(stream.height)) ? Number(stream.height) : null,
      };
    } catch {
      // Fall through to mdls.
    }
  }

  return {
    durationSeconds: readMdlsNumber("kMDItemDurationSeconds", absolutePath),
    width: readMdlsNumber("kMDItemPixelWidth", absolutePath),
    height: readMdlsNumber("kMDItemPixelHeight", absolutePath),
  };
}

function getImageMetadata(absolutePath) {
  if (hasSips) {
    try {
      const raw = runCommand("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", absolutePath]);
      const widthMatch = raw.match(/pixelWidth:\s*(\d+)/i);
      const heightMatch = raw.match(/pixelHeight:\s*(\d+)/i);
      return {
        width: widthMatch ? Number(widthMatch[1]) : null,
        height: heightMatch ? Number(heightMatch[1]) : null,
      };
    } catch {
      // Fall through to mdls.
    }
  }

  return {
    width: readMdlsNumber("kMDItemPixelWidth", absolutePath),
    height: readMdlsNumber("kMDItemPixelHeight", absolutePath),
  };
}

function buildImageSummary({ metadata, asset }) {
  const parts = [];

  if (metadata.width && metadata.height) {
    parts.push(`${metadata.width}x${metadata.height}`);
  }

  if (asset.mimeType) {
    parts.push(asset.mimeType);
  }

  if (asset.sizeBytes) {
    parts.push(`${Math.max(1, Math.round(asset.sizeBytes / 1024))} KB`);
  }

  return parts.join(" • ");
}

function buildBaseMediaBreakdown({ asset, metadata, derivedImages = [], processingMode = "", transcriptText = "" }) {
  const parts = [];

  if (metadata?.durationSeconds) {
    parts.push(`Duration ${formatDuration(metadata.durationSeconds)}`);
  }

  if (metadata?.width && metadata?.height) {
    parts.push(`${metadata.width}x${metadata.height}`);
  }

  if (asset?.mimeType) {
    parts.push(asset.mimeType);
  }

  if (asset?.sizeBytes) {
    parts.push(`${Math.max(1, Math.round(asset.sizeBytes / 1024))} KB`);
  }

  if (derivedImages.length) {
    parts.push(`${derivedImages.length} frame${derivedImages.length === 1 ? "" : "s"} analyzed${processingMode ? ` via ${processingMode}` : ""}`);
  }

  if (transcriptText) {
    parts.push("Transcript available");
  }

  if (hasTesseract) {
    parts.push("OCR enabled");
  }

  return dedupeStrings(parts);
}

function normalizeSignalInsights(payload, fallbackSummary, baseMediaBreakdown) {
  const raw = payload && typeof payload === "object" ? payload : {};

  return {
    summary: String(raw.summary || "").trim() || fallbackSummary,
    mediaBreakdown: dedupeStrings([...(Array.isArray(raw.media_breakdown) ? raw.media_breakdown : []), ...baseMediaBreakdown]),
    visibleText: dedupeStrings(Array.isArray(raw.visible_text) ? raw.visible_text : []),
    keyDetails: dedupeStrings(Array.isArray(raw.key_details) ? raw.key_details : []),
    dates: dedupeStrings(Array.isArray(raw.dates) ? raw.dates : []),
    rewards: dedupeStrings(Array.isArray(raw.rewards) ? raw.rewards : []),
    updateItems: dedupeStrings(Array.isArray(raw.update_items) ? raw.update_items : []),
    trendClues: dedupeStrings(Array.isArray(raw.trend_clues) ? raw.trend_clues : []),
    ocrEnabled: Boolean(raw.ocr_enabled),
  };
}

function buildSignalSummary(signalInsights, fallbackSummary) {
  const parts = [signalInsights?.summary || fallbackSummary];

  if (signalInsights?.dates?.length) {
    parts.push(`Dates: ${signalInsights.dates.slice(0, 3).join(" | ")}`);
  }

  if (signalInsights?.rewards?.length) {
    parts.push(`Rewards: ${signalInsights.rewards.slice(0, 3).join(" | ")}`);
  }

  if (signalInsights?.updateItems?.length) {
    parts.push(`Update items: ${signalInsights.updateItems.slice(0, 3).join(" | ")}`);
  }

  if (signalInsights?.visibleText?.length) {
    parts.push(`Visible text: ${signalInsights.visibleText.slice(0, 2).join(" | ")}`);
  }

  return dedupeStrings(parts).join(" • ");
}

function extractMediaSignals({
  asset,
  absolutePath,
  uploadsRoot,
  metadata,
  derivedImages = [],
  transcriptText = "",
  processingMode = "",
  fallbackSummary = "",
}) {
  const mediaSignalsScript = resolveMediaSignalsScript();
  const baseMediaBreakdown = buildBaseMediaBreakdown({
    asset,
    metadata,
    derivedImages,
    processingMode,
    transcriptText,
  });

  if (!mediaSignalsScript) {
    return normalizeSignalInsights({}, fallbackSummary, baseMediaBreakdown);
  }

  const args = [
    mediaSignalsScript,
    "--file",
    absolutePath,
    "--asset-type",
    asset.assetType,
    "--mime-type",
    asset.mimeType || "",
    "--summary",
    fallbackSummary,
    "--json",
  ];

  if (metadata?.width) {
    args.push("--width", String(metadata.width));
  }

  if (metadata?.height) {
    args.push("--height", String(metadata.height));
  }

  if (metadata?.durationSeconds) {
    args.push("--duration", String(metadata.durationSeconds));
  }

  derivedImages.slice(0, 8).forEach((frame) => {
    args.push("--frame", join(uploadsRoot, frame.storagePath));
  });

  if (transcriptText) {
    args.push("--transcript", transcriptText.slice(0, 4000));
  }

  try {
    const raw = execFileSync("python3", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return normalizeSignalInsights(JSON.parse(raw), fallbackSummary, baseMediaBreakdown);
  } catch {
    return normalizeSignalInsights({}, fallbackSummary, baseMediaBreakdown);
  }
}

function buildFrameTimestamps(durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) {
    return [0.15, 0.45, 0.8].slice(0, MAX_VIDEO_FRAMES);
  }

  const frameCount = resolveFrameCount(durationSeconds);
  const margin = resolveTimelineMargin(durationSeconds);
  const start = Math.min(margin, durationSeconds * 0.18);
  const end = Math.max(durationSeconds - margin, start + 0.15);

  if (frameCount <= 1 || end <= start) {
    return [Number(Math.max(durationSeconds * 0.5, 0.15).toFixed(2))];
  }

  const span = end - start;
  return Array.from({ length: frameCount }, (_, index) => {
    const position = start + (span * (index + 0.5)) / frameCount;
    return Number(position.toFixed(2));
  });
}

function resolveFrameCount(durationSeconds) {
  if (durationSeconds <= 6) {
    return Math.min(MAX_VIDEO_FRAMES, 4);
  }

  if (durationSeconds <= 15) {
    return Math.min(MAX_VIDEO_FRAMES, 5);
  }

  if (durationSeconds <= 30) {
    return Math.min(MAX_VIDEO_FRAMES, 6);
  }

  if (durationSeconds <= 60) {
    return Math.min(MAX_VIDEO_FRAMES, 8);
  }

  if (durationSeconds <= 180) {
    return Math.min(MAX_VIDEO_FRAMES, 12);
  }

  return Math.min(MAX_VIDEO_FRAMES, 14);
}

function resolveTimelineMargin(durationSeconds) {
  if (durationSeconds <= 8) {
    return 0.2;
  }

  if (durationSeconds <= 30) {
    return Math.min(1.5, durationSeconds * 0.08);
  }

  if (durationSeconds <= 180) {
    return Math.min(4, durationSeconds * 0.06);
  }

  return Math.min(6, durationSeconds * 0.05);
}

function createFrameDescriptor(absolutePath, uploadsRoot) {
  return {
    fileName: basename(absolutePath),
    storagePath: relative(uploadsRoot, absolutePath),
    mimeType: extname(absolutePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg",
  };
}

function extractFramesWithFfmpeg({ absolutePath, derivedDir, uploadsRoot, durationSeconds }) {
  mkdirSync(derivedDir, { recursive: true });
  const timestamps = buildFrameTimestamps(durationSeconds);
  const frames = [];

  timestamps.forEach((timestamp, index) => {
    const targetPath = join(derivedDir, `frame-${index + 1}.jpg`);
    runCommandSilently("ffmpeg", [
      "-y",
      "-ss",
      String(timestamp),
      "-i",
      absolutePath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      targetPath,
    ]);

    if (existsSync(targetPath)) {
      frames.push(createFrameDescriptor(targetPath, uploadsRoot));
    }
  });

  return frames;
}

function extractPosterWithQuickLook({ absolutePath, derivedDir, uploadsRoot }) {
  if (!hasQuickLook) {
    return [];
  }

  mkdirSync(derivedDir, { recursive: true });
  const tempDir = join(derivedDir, "quicklook-temp");
  mkdirSync(tempDir, { recursive: true });

  try {
    runCommandSilently("/usr/bin/qlmanage", ["-t", "-s", "1200", "-o", tempDir, absolutePath]);
    const generated = readdirSync(tempDir).find((file) => file.toLowerCase().endsWith(".png"));
    if (!generated) {
      return [];
    }

    const sourcePath = join(tempDir, generated);
    const targetPath = join(derivedDir, "poster.png");
    renameSync(sourcePath, targetPath);
    return [createFrameDescriptor(targetPath, uploadsRoot)];
  } catch {
    return [];
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function shouldAttemptTranscription() {
  if (!process.env.OPENAI_API_KEY) {
    return false;
  }

  const provider = (process.env.AI_PROVIDER || "auto").toLowerCase();
  if (provider === "mock") {
    return false;
  }

  const preference = String(process.env.ENABLE_VIDEO_TRANSCRIPTION || "auto").toLowerCase();
  if (["0", "false", "off", "no"].includes(preference)) {
    return false;
  }

  if (["1", "true", "on", "yes"].includes(preference)) {
    return true;
  }

  try {
    const url = new URL(OPENAI_BASE_URL);
    return url.hostname === "api.openai.com";
  } catch {
    return false;
  }
}

function canSubmitDirectlyForTranscription(fileName, mimeType) {
  const extension = extname(fileName || "").toLowerCase();
  if (directTranscriptionExtensions.has(extension)) {
    return true;
  }

  return ["audio/mp4", "video/mp4", "audio/mpeg", "audio/wav", "audio/webm", "video/webm"].includes(
    String(mimeType || "").toLowerCase(),
  );
}

function createAudioExtractionPath(derivedDir, fileName) {
  const cleanBase = basename(fileName, extname(fileName)).replace(/[^a-zA-Z0-9._-]/g, "-") || "audio-track";
  return join(derivedDir, `${cleanBase}.m4a`);
}

async function transcribeVideoAudio({ absolutePath, derivedDir, fileName, mimeType, sizeBytes }) {
  if (!shouldAttemptTranscription()) {
    return { text: "", reason: "transcription_disabled" };
  }

  let targetPath = absolutePath;
  let targetName = fileName;
  let targetMimeType = mimeType || "application/octet-stream";
  let cleanupPath = "";

  if (!canSubmitDirectlyForTranscription(fileName, mimeType)) {
    if (!hasFfmpeg) {
      return { text: "", reason: "unsupported_format_without_ffmpeg" };
    }

    mkdirSync(derivedDir, { recursive: true });
    const extractedAudioPath = createAudioExtractionPath(derivedDir, fileName);
    try {
      runCommandSilently("ffmpeg", ["-y", "-i", absolutePath, "-vn", "-ac", "1", "-ar", "16000", extractedAudioPath]);
    } catch {
      return { text: "", reason: "audio_extraction_failed" };
    }

    if (!existsSync(extractedAudioPath)) {
      return { text: "", reason: "audio_extraction_missing" };
    }

    targetPath = extractedAudioPath;
    targetName = basename(extractedAudioPath);
    targetMimeType = "audio/mp4";
    cleanupPath = extractedAudioPath;
    sizeBytes = statSync(extractedAudioPath).size;
  }

  if (sizeBytes > OPENAI_TRANSCRIPTION_MAX_BYTES) {
    return { text: "", reason: "file_too_large" };
  }

  try {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([readFileSync(targetPath)], { type: targetMimeType || "application/octet-stream" }),
      targetName,
    );
    formData.append("model", OPENAI_TRANSCRIPTION_MODEL);
    formData.append("response_format", "json");

    const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      return { text: "", reason: `transcription_request_failed_${response.status}` };
    }

    const payload = await response.json().catch(() => ({}));
    return {
      text: typeof payload.text === "string" ? payload.text.trim() : "",
      reason: "ok",
    };
  } catch {
    return { text: "", reason: "transcription_request_failed" };
  } finally {
    if (cleanupPath && existsSync(cleanupPath)) {
      rmSync(cleanupPath, { force: true });
    }
  }
}

function formatDuration(seconds) {
  if (!seconds || !Number.isFinite(seconds)) {
    return "";
  }

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function buildVideoSummary({ metadata, frames, transcriptText, frameMode, transcriptionReason }) {
  const summaryParts = [];

  if (metadata.durationSeconds) {
    summaryParts.push(`Duration ${formatDuration(metadata.durationSeconds)}`);
  }

  if (metadata.width && metadata.height) {
    summaryParts.push(`${metadata.width}x${metadata.height}`);
  }

  if (frames.length) {
    summaryParts.push(`${frames.length} frame${frames.length === 1 ? "" : "s"} extracted via ${frameMode}`);
  } else {
    summaryParts.push("No preview frame extracted");
  }

  if (transcriptText) {
    const preview = transcriptText.replace(/\s+/g, " ").trim();
    summaryParts.push(`Transcript: ${preview.length > 180 ? `${preview.slice(0, 177)}...` : preview}`);
  } else if (transcriptionReason === "transcription_disabled") {
    summaryParts.push("Transcript skipped");
  }

  return summaryParts.join(" • ");
}

export function getVideoProcessingCapabilities() {
  return {
    ffmpeg: hasFfmpeg,
    ffprobe: hasFfprobe,
    quickLook: hasQuickLook,
    mdls: hasMdls,
    tesseract: hasTesseract,
    transcription: shouldAttemptTranscription(),
    maxVideoFrames: MAX_VIDEO_FRAMES,
    mediaSignals: Boolean(resolveMediaSignalsScript()),
  };
}

export async function processStoredAsset({ asset, absolutePath, uploadsRoot, projectId }) {
  if (asset.assetType !== "video") {
    const metadata = getImageMetadata(absolutePath);
    const fallbackSummary = buildImageSummary({ metadata, asset });
    const signalInsights = extractMediaSignals({
      asset,
      absolutePath,
      uploadsRoot,
      metadata,
      fallbackSummary,
    });

    return {
      ...asset,
      extractedSummary: buildSignalSummary(signalInsights, fallbackSummary),
      derivedImages: [],
      transcriptText: "",
      imageMetadata: metadata,
      signalInsights,
    };
  }

  const metadata = getVideoMetadata(absolutePath);
  const derivedDir = join(uploadsRoot, projectId, "derived", asset.id);
  let frameMode = "none";
  let derivedImages = [];

  if (hasFfmpeg) {
    derivedImages = extractFramesWithFfmpeg({
      absolutePath,
      derivedDir,
      uploadsRoot,
      durationSeconds: metadata.durationSeconds,
    });
    frameMode = derivedImages.length ? "ffmpeg" : "metadata";
  }

  if (!derivedImages.length && hasQuickLook) {
    derivedImages = extractPosterWithQuickLook({
      absolutePath,
      derivedDir,
      uploadsRoot,
    });
    frameMode = derivedImages.length ? "quicklook" : frameMode;
  }

  const transcription = await transcribeVideoAudio({
    absolutePath,
    derivedDir,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
  });

  const fallbackSummary = buildVideoSummary({
    metadata,
    frames: derivedImages,
    transcriptText: transcription.text,
    frameMode,
    transcriptionReason: transcription.reason,
  });
  const signalInsights = extractMediaSignals({
    asset,
    absolutePath,
    uploadsRoot,
    metadata,
    derivedImages,
    transcriptText: transcription.text,
    processingMode: frameMode,
    fallbackSummary,
  });

  return {
    ...asset,
    extractedSummary: buildSignalSummary(signalInsights, fallbackSummary),
    derivedImages,
    transcriptText: transcription.text,
    videoMetadata: metadata,
    processingMode: frameMode,
    transcriptionReason: transcription.reason,
    signalInsights,
  };
}
