// Server-side only: send the list of available platforms, never credentials.
import { PLATFORM_ORDER } from "./platforms";

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

export function availableSearchPlatforms() {
  const cults3d = cults3dCredentials() !== null;
  const traceparts = tracePartsConfig() !== null;
  return PLATFORM_ORDER.filter((p) => (p !== "cults3d" || cults3d) && (p !== "traceparts" || traceparts));
}
