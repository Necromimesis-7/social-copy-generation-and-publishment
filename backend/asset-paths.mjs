import { join } from "node:path";

export function resolveAssetAbsolutePath(asset, uploadsRoot) {
  if (asset?.absolutePath) {
    return asset.absolutePath;
  }

  if (!asset?.storagePath) {
    return "";
  }

  return join(uploadsRoot, asset.storagePath);
}
