import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLib } from "./helpers.mjs";

const { licenseLink, licenseSummary, licenseFromModelMetadata } = loadLib("modelLicense");

test("license summaries distinguish commercial use, attribution and sharing adaptations", () => {
  const labels = [
    ["CC0", true, "May be shared"],
    ["CC BY 4.0", true, "May be shared"],
    ["CC-BY-SA", true, "same or a compatible license"],
    ["CC BY-ND 4.0", true, "May not be shared"],
    ["CC Attribution-NonCommercial", false, "May be shared"],
    ["Creative Commons Attribution NonCommercial ShareAlike 4.0 International", false, "same or a compatible license"],
    ["CC BY-NC-ND 4.0", false, "May not be shared"],
  ];
  for (const [label, commercial, adaptations] of labels) {
    const summary = licenseSummary(label);
    assert.ok(summary, label);
    assert.equal(summary.commercial.startsWith("Allowed"), commercial, label);
    assert.ok(summary.adaptations.includes(adaptations), label);
    assert.equal(summary.attribution, label === "CC0" ? "Not required by CC0" : "Required when sharing");
  }
});

test("links only to canonical terms and does not invent a missing version or permission", () => {
  assert.equal(licenseSummary("CC BY").officialUrl, undefined);
  assert.equal(licenseSummary("CC BY-NC 4.0").officialUrl, "https://creativecommons.org/licenses/by-nc/4.0/");
  assert.equal(licenseSummary("CC0").officialUrl, "https://creativecommons.org/publicdomain/zero/1.0/");
  for (const value of [undefined, "Free", "Standard Digital File License", "CC BY 9.0", "CC BY or CC BY-NC",
    "https://other.example/creativecommons.org/licenses/by/4.0/", "https://creativecommons.org.evil.example/licenses/by/4.0/",
    "https://creativecommons.org@other.example/licenses/by/4.0/"]) {
    assert.equal(licenseSummary(value), undefined, value);
  }
  assert.equal(licenseSummary("http://creativecommons.org/licenses/by-nd/4.0/deed.tr").officialUrl,
    "https://creativecommons.org/licenses/by-nd/4.0/");
});

test("uses explicit model metadata, not image, webpage or description licenses", () => {
  const photo = { "@type": "ImageObject", license: "CC0" };
  const page = { "@type": "WebPage", license: "CC BY 4.0", image: photo };
  const model = { "@type": ["Thing", "3DModel"], license: { "@id": "https://creativecommons.org/licenses/by-nc/4.0/" } };
  assert.equal(licenseFromModelMetadata([page, photo, { "@type": "Product", description: "CC0" }]), undefined);
  assert.deepEqual(licenseFromModelMetadata([{ "@graph": [photo, { ...page, mainEntity: model }] }]), {
    license: "CC BY-NC 4.0", licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
  });
  assert.deepEqual(licenseFromModelMetadata([{ ...model, license: ["CC0", "CC BY-NC"] }]), { license: "Multiple license terms" });
  assert.deepEqual(licenseFromModelMetadata([model, { "@type": "Product", license: "CC0" }]), { license: "Multiple license terms" });
});

test("retains the provider's exact license name and link without inferring custom reuse rights", () => {
  const url = "https://models.example/terms/files";
  const license = "Standard Digital File License — Personal Use Only";
  assert.deepEqual(licenseFromModelMetadata([{ "@type": "Product", license: [{ name: license, url }] }]), {
    license, licenseUrl: url,
  });
  assert.equal(licenseSummary(license), undefined);
  assert.deepEqual(licenseFromModelMetadata([{ "@type": "3DModel", license: url }]), { license: "Site license", licenseUrl: url });
  for (const value of ["javascript:alert(1)", "data:text/html,terms", "//models.example/terms", "https://models.example@other.example/terms"]) {
    assert.equal(licenseLink(value), undefined, value);
  }
});

test("does not summarize contradictory license names and Creative Commons links", () => {
  const url = "https://creativecommons.org/licenses/by-nc/4.0/";
  assert.equal(licenseSummary("CC BY 4.0", url), undefined);
  assert.equal(licenseSummary("CC BY-NC 3.0", url), undefined);
  assert.ok(licenseSummary("CC BY-NC", url));
});
