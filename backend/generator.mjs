import { buildFallbackDraftPackage } from "./fallback-generator.mjs";
import { generateDraftPackageWithGateway } from "./gateway-generator.mjs";
import { generateDraftPackageWithOpenAI } from "./openai-generator.mjs";

function resolveProviderMode() {
  const configuredMode = (process.env.AI_PROVIDER || "auto").toLowerCase();

  if (configuredMode === "mock") {
    return "mock";
  }

  if (configuredMode === "gateway" || configuredMode === "leihuo" || configuredMode === "kimi") {
    return "gateway";
  }

  if (configuredMode === "openai") {
    return "openai";
  }

  if (process.env.GATEWAY_API_KEY) {
    return "gateway";
  }

  return process.env.OPENAI_API_KEY ? "openai" : "mock";
}

export function getGeneratorMode() {
  return resolveProviderMode();
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError" || /cancelled/i.test(String(error?.message || ""));
}

function shouldPassThroughError(error) {
  const statusCode = Number(error?.statusCode || 0);
  return statusCode >= 400 && statusCode < 500;
}

export async function generateDraftPackage(params) {
  const provider = resolveProviderMode();

  if (provider === "gateway") {
    try {
      return await generateDraftPackageWithGateway(params);
    } catch (error) {
      if (isAbortError(error) || params.signal?.aborted || shouldPassThroughError(error)) {
        throw error;
      }

      console.warn("Gateway generation failed. Falling back to local generator.", error);
      return buildFallbackDraftPackage({
        ...params,
        fallbackReason: error?.message || "Gateway generation failed.",
      });
    }
  }

  if (provider === "openai") {
    try {
      return await generateDraftPackageWithOpenAI(params);
    } catch (error) {
      if (isAbortError(error) || params.signal?.aborted || shouldPassThroughError(error)) {
        throw error;
      }

      console.warn("OpenAI generation failed. Falling back to local generator.", error);
      return buildFallbackDraftPackage({
        ...params,
        fallbackReason: error?.message || "OpenAI generation failed.",
      });
    }
  }

  return buildFallbackDraftPackage(params);
}
