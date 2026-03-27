import { createRequire } from "node:module";

import { buildCosObjectKey, buildCosPublicUrl, getCosConfig } from "./cos-config.mjs";

const require = createRequire(import.meta.url);

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizePolicySegment(value, fallback = "project") {
  const clean = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");

  return clean || fallback;
}

function getCosStsClient() {
  try {
    return require("qcloud-cos-sts");
  } catch {
    throw createHttpError(
      500,
      "COS direct upload support is not installed. Run npm install on the server after pulling the latest code.",
    );
  }
}

export async function createCosUploadSession({ projectId, fileName, assetType = "file" }) {
  const config = getCosConfig();
  if (!config.enabled) {
    throw createHttpError(400, "COS direct upload is not configured yet.");
  }

  const safeProjectId = sanitizePolicySegment(projectId, "project");
  const key = buildCosObjectKey({ projectId: safeProjectId, fileName, assetType });
  const prefix = `${config.uploadPrefix}/${safeProjectId}/`;
  const resource = `qcs::cos:${config.region}:uid/${config.appId}:${config.bucket}/${prefix}*`;
  const policy = {
    version: "2.0",
    statement: [
      {
        action: [
          "name/cos:PutObject",
          "name/cos:PostObject",
          "name/cos:InitiateMultipartUpload",
          "name/cos:ListMultipartUploads",
          "name/cos:ListParts",
          "name/cos:UploadPart",
          "name/cos:CompleteMultipartUpload",
          "name/cos:AbortMultipartUpload",
        ],
        effect: "allow",
        resource: [resource],
      },
    ],
  };

  const COS_STS = getCosStsClient();
  const data = await new Promise((resolve, reject) => {
    COS_STS.getCredential(
      {
        secretId: config.secretId,
        secretKey: config.secretKey,
        durationSeconds: 1800,
        policy,
      },
      (error, credentials) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(credentials || {});
      },
    );
  });

  return {
    bucket: config.bucket,
    region: config.region,
    key,
    publicUrl: buildCosPublicUrl(key),
    startTime: Number(data.startTime || 0),
    expiredTime: Number(data.expiredTime || 0),
    credentials: data.credentials || {},
  };
}

