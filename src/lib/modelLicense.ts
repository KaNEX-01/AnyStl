const CC_CODES = ["by", "by-sa", "by-nd", "by-nc", "by-nc-sa", "by-nc-nd"] as const;
type CCCode = (typeof CC_CODES)[number];
const CC_ORIGIN = "https://creativecommons.org";
const VERSION = /^(?:1\.0|2\.0|2\.5|3\.0|4\.0)$/;
const isCCCode = (code: string): code is CCCode => CC_CODES.some((known) => code === known);

/** License links are displayed, not fetched by AnyStl. */
export function licenseLink(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return;
  try {
    const url = new URL(value);
    if (url.hostname && !url.username && !url.password) return url.href;
  } catch { /* Ignore invalid links. */ }
}

/** Only recognize explicit CC labels and canonical Creative Commons URLs. */
function creativeCommons(value: string): { code: CCCode | "cc0"; version?: string } | undefined {
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.hostname !== "creativecommons.org" || url.port || url.username || url.password) return;
      if (/^\/publicdomain\/zero\/1\.0(?:\/(?:deed(?:\.[a-z-]+)?|legalcode))?\/?$/.test(url.pathname)) return { code: "cc0", version: "1.0" };
      const match = url.pathname.match(/^\/licenses\/([a-z-]+)\/([\d.]+)(?:\/(?:deed(?:\.[a-z-]+)?|legalcode))?\/?$/);
      if (match && isCCCode(match[1]!) && VERSION.test(match[2]!)) return { code: match[1]!, version: match[2] };
    } catch { /* An invalid URL is not an identified license. */ }
    return;
  }

  const label = value.trim().toLowerCase().replace(/[-\s]+/g, " ");
  if (/^cc ?0(?: 1\.0)?(?: universal)?$/.test(label)) return { code: "cc0", version: "1.0" };
  const cc = label.match(/^(?:cc|creative commons) (.+)$/)?.[1];
  if (!cc) return;
  const version = cc.match(/ ([\d.]+)(?: international)?$/)?.[1];
  if (version && !VERSION.test(version)) return;
  const name = cc.replace(/ [\d.]+(?: international)?$/, "")
    .replace(/\b(?:non commercial|noncommercial)\b/g, "nc")
    .replace(/\b(?:share alike|sharealike)\b/g, "sa")
    .replace(/\b(?:no derivatives|noderivatives|no derivs|noderivs)\b/g, "nd")
    .replace(/^attribution\b/, "by");
  const code = name.replace(/ /g, "-");
  return isCCCode(code) ? { code, version } : undefined;
}

/** Give a license URL a short label when the provider didn't supply one. */
export function licenseUrlLabel(url: string): string {
  const cc = creativeCommons(url);
  if (cc?.code === "cc0") return "CC0";
  if (cc) return `CC ${cc.code.toUpperCase()}${cc.version ? ` ${cc.version}` : ""}`;
  if (/^https?:\/\/(?:www\.)?gnu\.org\/licenses\/gpl[-.]/i.test(url)) return "GPL";
  return "Site license";
}

type LicenseMetadata = { license?: string; licenseUrl?: string };
const MULTIPLE = "Multiple license terms";

function readLicense(value: unknown): LicenseMetadata | undefined {
  if (Array.isArray(value)) {
    if (value.length > 1) return { license: MULTIPLE };
    value = value[0];
  }
  const item = value && typeof value === "object" ? value as Record<string, unknown> : undefined;
  const name = typeof value === "string" ? value.trim() : typeof item?.name === "string" ? item.name.trim() : undefined;
  const url = licenseLink(value) || licenseLink(item?.url) || licenseLink(item?.["@id"]) || licenseLink(name);
  if (url) return { license: name && !licenseLink(name) ? name : licenseUrlLabel(url), licenseUrl: url };
  if (name) return { license: name };
}

/** JSON-LD may describe other works, including the page and its photos. */
export function licenseFromModelMetadata(nodes: unknown[], depth = 0): LicenseMetadata | undefined {
  if (depth > 5) return;
  let found: LicenseMetadata | undefined;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const candidates: (LicenseMetadata | undefined)[] = [];
    if (Array.isArray(node)) {
      candidates.push(licenseFromModelMetadata(node, depth + 1));
    } else {
      const item = node as Record<string, unknown>;
      const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
      if (types.some((type) => typeof type === "string" && /^(?:https?:\/\/schema\.org\/)?(?:3DModel|Product)$/.test(type))) {
        candidates.push(readLicense(item.license));
      }
      candidates.push(licenseFromModelMetadata([item["@graph"], item.mainEntity], depth + 1));
    }
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (found && (found.license !== candidate.license ||
        (found.licenseUrl && candidate.licenseUrl && found.licenseUrl !== candidate.licenseUrl))) {
        return { license: MULTIPLE };
      }
      if (!found || candidate.licenseUrl) found = candidate;
    }
  }
  return found;
}

export function licenseSummary(value?: string, termsUrl?: string) {
  const named = value ? creativeCommons(value.trim()) : undefined;
  const linked = termsUrl ? creativeCommons(termsUrl) : undefined;
  if (named && linked && (named.code !== linked.code || (named.version && named.version !== linked.version))) return;
  const cc = named || (!value ? linked : undefined);
  if (!cc) return;
  if (cc.code === "cc0") {
    return {
      officialUrl: `${CC_ORIGIN}/publicdomain/zero/1.0/`,
      commercial: "Allowed under CC0",
      adaptations: "May be shared",
      attribution: "Not required by CC0",
    };
  }
  const terms = cc.code.split("-");
  return {
    officialUrl: cc.version ? `${CC_ORIGIN}/licenses/${cc.code}/${cc.version}/` : undefined,
    commercial: terms.includes("nc") ? "Not allowed by this license" : "Allowed, subject to the license terms",
    adaptations: terms.includes("nd") ? "May not be shared under this license"
      : terms.includes("sa") ? "Share under the same or a compatible license"
      : "May be shared, subject to the license terms",
    attribution: "Required when sharing",
  };
}
