const platformOrder = ["X", "Instagram", "TikTok", "YouTube"];

function platformSortValue(platform = "") {
  const index = platformOrder.indexOf(platform);
  return index === -1 ? platformOrder.length + 1 : index;
}

function normalizeLabel(value) {
  return String(value || "").trim();
}

export function normalizeGenerationType(value) {
  return ["update", "trending", "guide", "general"].includes(value) ? value : "general";
}

export function formatGenerationTypeLabel(value) {
  const resolved = normalizeGenerationType(value);
  if (resolved === "update") {
    return "Update & events";
  }

  if (resolved === "trending") {
    return "Trending topic";
  }

  if (resolved === "guide") {
    return "Guide";
  }

  return `${resolved.charAt(0).toUpperCase()}${resolved.slice(1)}`;
}

export function getGenerationTargets(project = {}) {
  const seen = new Set();
  return [...(project.accounts || [])]
    .filter((account) => account?.platform)
    .filter((account) => account.enabled !== false)
    .sort((left, right) => {
      const platformDelta = platformSortValue(left.platform) - platformSortValue(right.platform);
      if (platformDelta !== 0) {
        return platformDelta;
      }

      return `${left.accountName || ""} ${left.handle || ""}`.localeCompare(
        `${right.accountName || ""} ${right.handle || ""}`,
      );
    })
    .map((account) => ({
      accountId: account.id || null,
      platform: account.platform,
      accountLabel: normalizeLabel(account.handle || account.accountName || account.platform),
    }))
    .filter((target) => {
      const key = `${target.platform}::${target.accountId || target.accountLabel}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function getTargetKey(target = {}) {
  return `${target.platform || ""}::${normalizeLabel(target.accountId || target.accountLabel)}`;
}

export function describePlatformRequirement(platform) {
  if (platform === "YouTube") {
    return "Return one title and one description.";
  }

  if (platform === "Instagram") {
    return "Return one Instagram caption.";
  }

  if (platform === "TikTok") {
    return "Return one TikTok caption.";
  }

  return "Return one X post body.";
}

export function buildTargetListText(targets = []) {
  return targets
    .map((target, index) => `${index + 1}. ${target.platform} / ${target.accountLabel} — ${describePlatformRequirement(target.platform)}`)
    .join("\n");
}
