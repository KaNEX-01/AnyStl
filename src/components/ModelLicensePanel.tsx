import { licenseLink, licenseSummary, licenseUrlLabel } from "@/lib/modelLicense";
import type { ModelDetails, ModelResult } from "@/lib/types";
import { recordViewed } from "@/lib/useViewed";

const link = "text-spool-accent-soft underline underline-offset-2 hover:text-spool-text";

export function ModelLicensePanel({ model, details }: { model: ModelResult; details?: ModelDetails }) {
  // The model's detail page or detail API is more current than a saved/search label.
  const current = details?.error ? undefined : details?.license?.trim();
  const currentUrl = details?.error ? undefined : licenseLink(details?.licenseUrl);
  const license = current || currentUrl || model.license?.trim();
  const licenseAsUrl = licenseLink(license);
  const termsUrl = currentUrl || licenseAsUrl;
  const label = licenseAsUrl ? licenseUrlLabel(licenseAsUrl) : license;
  const summary = licenseSummary(license, termsUrl);

  return (
    <section aria-label="Model license" className="flex flex-col gap-2 rounded-2xl border border-spool-line bg-spool-well p-4 text-sm">
      <h3 className="font-semibold text-spool-text">License</h3>
      <p aria-live="polite" className="break-words text-spool-text">
        {label || (details?.error ? "Could not check the license" : details ? "License not stated" : "Checking the source…")}
        {label && <span className="ml-2 text-xs text-spool-muted">{current || currentUrl ? "Source details" : "Listing or saved metadata"}</span>}
      </p>
      {summary ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-spool-muted">Commercial use</dt>
          <dd>{summary.commercial}</dd>
          <dt className="text-spool-muted">Sharing adaptations</dt>
          <dd>{summary.adaptations}</dd>
          <dt className="text-spool-muted">Attribution</dt>
          <dd>{summary.attribution}</dd>
        </dl>
      ) : <p className="text-xs text-spool-muted">AnyStl can’t confirm reuse permissions from this information.</p>}
      <p className="text-xs text-spool-muted">Verify the license on this model’s source page before using or sharing it.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <a href={model.url} target="_blank" rel="noopener noreferrer" className={link}
          onClick={() => recordViewed(model)} onAuxClick={(e) => e.button === 1 && recordViewed(model)}>
          Check on source site ↗
        </a>
        {termsUrl ? (
          <a href={termsUrl} target="_blank" rel="noopener noreferrer" className={link}>Reported license terms ↗</a>
        ) : summary?.officialUrl && (
          <a href={summary.officialUrl} target="_blank" rel="noopener noreferrer" className={link}>Creative Commons license ↗</a>
        )}
      </div>
    </section>
  );
}
