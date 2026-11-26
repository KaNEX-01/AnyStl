// Server-side only: send the list of available platforms, never credentials.
import { PLATFORM_ORDER, PLATFORMS } from "./platforms";
import { searxngBaseUrl, supportsSearxng } from "./scrapers/searxng";
import type { Platform } from "./types";

export function cults3dCredentials() {
  const username = process.env.CULTS3D_USERNAME?.trim();
  const apiKey = process.env.CULTS3D_API_KEY?.trim();
  return username && apiKey ? { username, apiKey } : null;
}

export function tracePartsConfig() {
  const apiKey = process.env.TRACEPARTS_API_KEY?.trim();
  const tenantUid = process.env.TRACEPARTS_TENANT_UID?.trim();
  const classificationCode = process.env.TRACEPARTS_CLASSIFICATION_CODE?.trim();
  const categoryCode = process.env.TRACEPARTS_CATEGORY_CODE?.trim() || "";
  const easyLinkId = process.env.TRACEPARTS_EASYLINK_ID?.trim();
  if (!apiKey || !tenantUid || !classificationCode || !easyLinkId || !/^[a-z0-9_-]+$/i.test(easyLinkId)) return null;
  return { apiKey, tenantUid, classificationCode, categoryCode, easyLinkId };
}

export function noBrowserMode(): boolean {
  const raw = process.env.ANYSTL_NO_BROWSER?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function hasDirectApi(platform: Platform): boolean {
  if (!PLATFORMS[platform].browser) return true;
  if (platform === "thingiverse" && process.env.THINGIVERSE_ACCESS_TOKEN?.trim()) return true;
  if (platform === "cgtrader" && process.env.CGTRADER_ACCESS_TOKEN?.trim()) return true;
  return searxngBaseUrl() !== null && supportsSearxng(platform);
}

export function availableSearchPlatforms() {
  const cults3d = cults3dCredentials() !== null || searxngBaseUrl() !== null;
  const traceparts = tracePartsConfig() !== null;
  const apiOnly = noBrowserMode();
  return PLATFORM_ORDER.filter((p) => {
    if (p === "cults3d" && !cults3d) return false;
    if (p === "traceparts" && !traceparts) return false;
    if (apiOnly && !hasDirectApi(p)) return false;
    return true;
  });
}
