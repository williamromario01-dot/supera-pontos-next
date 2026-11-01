import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BRANDING_LOGO_MAX_BYTES,
  contrastText,
  detectBrandingImageType,
  resolveEffectiveBranding,
} from "../src/lib/tenant-branding.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("branding follows platform, company and allowed unit inheritance", () => {
  const platform = resolveEffectiveBranding(null, null);
  assert.equal(platform.source, "platform");
  assert.equal(platform.primaryColor, "#f97316");

  const company = { branding: { primaryColor: "#112233", logoUrl: "https://example.test/company.png" } };
  assert.equal(resolveEffectiveBranding(company, null).source, "company");
  assert.equal(resolveEffectiveBranding(company, null).primaryColor, "#112233");

  const blockedUnit = resolveEffectiveBranding(company, { branding: { primaryColor: "#445566" } });
  assert.equal(blockedUnit.primaryColor, "#112233");
  const allowedUnit = resolveEffectiveBranding(
    { branding: { ...company.branding, allowUnitBranding: true } },
    { branding: { primaryColor: "#445566" } },
  );
  assert.equal(allowedUnit.source, "unit");
  assert.equal(allowedUnit.primaryColor, "#445566");
  assert.equal(allowedUnit.logoUrl, "https://example.test/company.png");
});

test("contrast fallback chooses readable text", () => {
  assert.equal(contrastText("#000000"), "#ffffff");
  assert.equal(contrastText("#ffffff"), "#0f172a");
  assert.equal(contrastText("invalid"), "#ffffff");
});

test("logo validation uses magic bytes and a bounded size", () => {
  assert.equal(BRANDING_LOGO_MAX_BYTES, 512 * 1024);
  assert.equal(detectBrandingImageType(Uint8Array.from([0xff, 0xd8, 0xff])), "image/jpeg");
  assert.equal(detectBrandingImageType(Uint8Array.from([0x3c, 0x73, 0x76, 0x67])), null);
});

test("company and unit branding routes enforce server-side tenant roles", async () => {
  const [companyRoute, unitRoute] = await Promise.all([
    read("src/app/api/company/branding/route.ts"),
    read("src/app/api/schools/[id]/branding/route.ts"),
  ]);
  assert.match(companyRoute, /auth\.role !== "company_admin"/);
  assert.match(companyRoute, /\{ _id: value\.companyId \}/);
  assert.doesNotMatch(companyRoute, /body\.companyId|formData\.get\("companyId"\)/);
  assert.match(unitRoute, /auth\.role !== "admin"/);
  assert.match(unitRoute, /hasSchoolAccess\(result\.auth, id\)/);
  assert.match(unitRoute, /company\.branding\?\.allowUnitBranding !== true/);
  assert.match(unitRoute, /\{ _id: value\.schoolId, companyId: value\.school\.companyId \}/);
  assert.doesNotMatch(unitRoute, /body\.schoolId|formData\.get\("schoolId"\)/);
});

test("logo uploads are isolated and reject untrusted browser MIME", async () => {
  const [companyRoute, unitRoute] = await Promise.all([
    read("src/app/api/company/branding/route.ts"),
    read("src/app/api/schools/[id]/branding/route.ts"),
  ]);
  for (const source of [companyRoute, unitRoute]) {
    assert.match(source, /detectBrandingImageType\(bytes\)/);
    assert.match(source, /detectedType !== file\.type\.toLowerCase\(\)/);
    assert.match(source, /BRANDING_LOGO_MAX_BYTES/);
    assert.doesNotMatch(source, /image\/svg\+xml/);
  }
  assert.match(companyRoute, /companies\/\$\{value\.companyId\.toString\(\)\}\/branding/);
  assert.match(unitRoute, /schools\/\$\{value\.schoolId\.toString\(\)\}\/branding/);
});

test("official PWA identity remains static and tenant-independent", async () => {
  const [manifest, layout, worker] = await Promise.all([
    read("src/app/manifest.ts"),
    read("src/app/layout.tsx"),
    read("public/sw.js"),
  ]);
  assert.match(manifest, /name: "SUPERPONTOS"/);
  assert.match(manifest, /superpontos-icon-192\.png/);
  assert.doesNotMatch(manifest, /branding|company|school|tenant/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(layout, /favicon-32x32\.png/);
  assert.match(worker, /superpontos-icon-192\.png/);
});
