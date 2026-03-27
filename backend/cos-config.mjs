function toBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function sanitizePathSegment(value, fallback = "file") {
  const clean = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");

  return clean || fallback;
}

function sanitizeFileName(value) {
  const clean = String(value || "upload.bin")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clean || "upload.bin";
}

function deriveAppId(bucket) {
  const match = String(bucket || "").match(/-(\d{6,})$/);
  return match?.[1] || "";
}

export function getCosConfig() {
  const bucket = String(process.env.COS_BUCKET || "").trim();
  const region = String(process.env.COS_REGION || "").trim();
  const secretId = String(process.env.COS_SECRET_ID || "").trim();
  const secretKey = String(process.env.COS_SECRET_KEY || "").trim();
  const uploadPrefix = sanitizePathSegment(process.env.COS_UPLOAD_PREFIX || "uploads", "uploads");
  const configuredPublicBaseUrl = String(process.env.COS_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  const publicBaseUrl =
    configuredPublicBaseUrl ||
    (bucket && region ? `https://${bucket}.cos.${region}.myqcloud.com` : "");
  const directUploadMinBytes = Math.max(0, Number(process.env.COS_DIRECT_UPLOAD_MIN_BYTES || 0));
  const appId = deriveAppId(bucket);
  const enabled = toBoolean(process.env.COS_ENABLED) && Boolean(bucket && region && secretId && secretKey && appId);

  return {
    enabled,
    bucket,
    region,
    secretId,
    secretKey,
    uploadPrefix,
    publicBaseUrl,
    directUploadMinBytes,
    appId,
  };
}

export function getClientCosConfig() {
  const config = getCosConfig();
  return {
    enabled: config.enabled,
    bucket: config.bucket,
    region: config.region,
    uploadPrefix: config.uploadPrefix,
    publicBaseUrl: config.publicBaseUrl,
    directUploadMinBytes: config.directUploadMinBytes,
  };
}

export function buildCosObjectKey({ projectId, fileName, assetType = "file" }) {
  const config = getCosConfig();
  const safeProjectId = sanitizePathSegment(projectId, "project");
  const safeType = sanitizePathSegment(assetType, "file");
  const safeFileName = sanitizeFileName(fileName);
  return `${config.uploadPrefix}/${safeProjectId}/${safeType}/${Date.now()}-${safeFileName}`;
}

export function buildCosPublicUrl(storageKey) {
  const config = getCosConfig();
  if (!config.publicBaseUrl) {
    return "";
  }

  return `${config.publicBaseUrl}/${String(storageKey || "").replace(/^\/+/, "")}`;
}

