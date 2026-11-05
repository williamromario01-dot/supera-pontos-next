import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BRANDING_LOGO_MAX_BYTES,
  contrastText,
  detectBrandingImageType,
  resolveEffectiveBranding,
  productSectionTitle,
  validateDisplayName,
  validateShortName,
} from "../src/lib/tenant-branding.ts";
import { PROVIDER_IDENTITY } from "../src/lib/product-identity.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("branding follows platform, company and allowed unit inheritance", () => {
  const platform = resolveEffectiveBranding(null, null);
  assert.equal(platform.source, "platform");
  assert.equal(platform.primaryColor, "#f97316");
  assert.equal(platform.displayName, "SUPERPONTOS");
  assert.equal(platform.brandGradientStart, "#f97316");
  assert.equal(platform.brandGradientEnd, "#facc15");

  const company = { branding: { displayName: "Colégio Evolução", primaryColor: "#112233", logoUrl: "https://example.test/company.png" } };
  assert.equal(resolveEffectiveBranding(company, null).source, "company");
  assert.equal(resolveEffectiveBranding(company, null).primaryColor, "#112233");
  assert.equal(resolveEffectiveBranding(company, null).displayName, "Colégio Evolução");

  const blockedUnit = resolveEffectiveBranding(company, { branding: { displayName: "Unidade Centro", primaryColor: "#445566" } });
  assert.equal(blockedUnit.primaryColor, "#112233");
  assert.equal(blockedUnit.displayName, "Colégio Evolução");
  const allowedUnit = resolveEffectiveBranding(
    { branding: { ...company.branding, allowUnitBranding: true, allowUnitDisplayName: true } },
    { branding: { displayName: "Unidade Centro", primaryColor: "#445566" } },
  );
  assert.equal(allowedUnit.source, "unit");
  assert.equal(allowedUnit.primaryColor, "#445566");
  assert.equal(allowedUnit.logoUrl, "https://example.test/company.png");
  assert.equal(allowedUnit.displayName, "Unidade Centro");
});

test("brand gradient is tenant-isolated, inheritable and legacy-compatible", () => {
  const supera = { branding: { brandGradientStart: "#f97316", brandGradientEnd: "#facc15", allowUnitBranding: true } };
  const yagi = { branding: { brandGradientStart: "#2563eb", brandGradientEnd: "#7c3aed" } };
  const unit = { branding: { brandGradientStart: "#10b981", brandGradientEnd: "#06b6d4" } };
  assert.deepEqual(
    [resolveEffectiveBranding(supera, null).brandGradientStart, resolveEffectiveBranding(supera, null).brandGradientEnd],
    ["#f97316", "#facc15"],
  );
  assert.deepEqual(
    [resolveEffectiveBranding(yagi, null).brandGradientStart, resolveEffectiveBranding(yagi, null).brandGradientEnd],
    ["#2563eb", "#7c3aed"],
  );
  assert.deepEqual(
    [resolveEffectiveBranding(supera, unit).brandGradientStart, resolveEffectiveBranding(supera, unit).brandGradientEnd],
    ["#10b981", "#06b6d4"],
  );
  assert.equal(resolveEffectiveBranding({ branding: {} }, null).brandGradientEnd, "#facc15");
  assert.equal(resolveEffectiveBranding({ branding: { shortName: "Yagi" } }, null).shortName, "Yagi");
});

test("product titles use explicit isolated short names and a safe default", () => {
  const supera = resolveEffectiveBranding({ branding: { displayName: "Empresa Supera", shortName: "Supera" } }, null);
  const yagi = resolveEffectiveBranding({ branding: { displayName: "Marketing Yagi", shortName: "Yagi" } }, null);
  assert.equal(productSectionTitle(supera), "Produtos Supera");
  assert.equal(productSectionTitle(yagi), "Produtos Yagi");
  assert.equal(productSectionTitle(resolveEffectiveBranding({ branding: { displayName: "Nome sem regra" } }, null)), "Produtos Super");
  assert.equal(validateShortName(" Yagi ").valid, true);
  assert.equal(validateShortName("Y").valid, false);
  assert.equal(validateShortName("<b>Yagi</b>").valid, false);
});

test("tenant theme clears stale identity and reloads without cache on navigation", async () => {
  const source = await read("src/components/TenantTheme.tsx");
  assert.match(source, /resolved\?\.key === requestKey \? resolved\.branding : PLATFORM_BRANDING/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /\[requestKey\]/);
  assert.match(source, /tenant-branding-changed/);
  assert.match(source, /controller\.signal\.aborted/);
});

test("display-name inheritance restores company and platform defaults", () => {
  const company = { branding: { displayName: "Rede Aprender", allowUnitDisplayName: true } };
  assert.equal(resolveEffectiveBranding(company, { branding: {} }).displayName, "Rede Aprender");
  assert.equal(resolveEffectiveBranding(company, { branding: { displayName: null } }).displayName, "Rede Aprender");
  assert.equal(resolveEffectiveBranding({ branding: {} }, { branding: {} }).displayName, "SUPERPONTOS");
});

test("display names are trimmed, bounded, Portuguese-friendly and plain text", () => {
  assert.deepEqual(validateDisplayName("  Supera Jardim das Américas  "), {
    valid: true,
    value: "Supera Jardim das Américas",
  });
  assert.equal(validateDisplayName("A").valid, false);
  assert.equal(validateDisplayName(" ".repeat(20)).valid, false);
  assert.equal(validateDisplayName("A".repeat(61)).valid, false);
  assert.equal(validateDisplayName("<script>alert(1)</script>").valid, false);
  assert.deepEqual(validateDisplayName(null), { valid: true, value: null });
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
  assert.match(companyRoute, /branding\.displayName/);
  assert.match(companyRoute, /branding\.allowUnitDisplayName/);
  assert.match(companyRoute, /COMPANY_PATCH_FIELDS/);
  assert.match(companyRoute, /"brandGradientStart"/);
  assert.match(companyRoute, /"brandGradientEnd"/);
  assert.match(unitRoute, /auth\.role !== "admin"/);
  assert.match(unitRoute, /hasSchoolAccess\(result\.auth, id\)/);
  assert.match(unitRoute, /result\.auth\.companyId \? \{ companyId: result\.auth\.companyId \}/);
  assert.match(unitRoute, /company\.branding\?\.allowUnitBranding !== true/);
  assert.match(unitRoute, /company\.branding\?\.allowUnitDisplayName !== true/);
  assert.match(unitRoute, /\{ _id: value\.schoolId, companyId: value\.school\.companyId \}/);
  assert.doesNotMatch(unitRoute, /body\.schoolId|formData\.get\("schoolId"\)/);
  assert.match(unitRoute, /updatesDisplayName && value\.company\.branding\?\.allowUnitDisplayName !== true/);
  assert.match(unitRoute, /updatesColors && value\.company\.branding\?\.allowUnitBranding !== true/);
  assert.match(unitRoute, /"brandGradientStart"/);
  assert.match(unitRoute, /"brandGradientEnd"/);
});

test("authorized branding editor persists both gradient colors and previews the full name", async () => {
  const settings = await read("src/components/BrandingSettings.tsx");
  assert.match(settings, /Cor inicial do degradê do nome/);
  assert.match(settings, /Cor final do degradê do nome/);
  assert.match(settings, /brandGradientStart: branding\.brandGradientStart/);
  assert.match(settings, /brandGradientEnd: branding\.brandGradientEnd/);
  assert.match(settings, /tenant-platform-name block text-lg/);
});

test("educators, students and arbitrary tenant identifiers cannot update branding", async () => {
  const [companyRoute, unitRoute] = await Promise.all([
    read("src/app/api/company/branding/route.ts"),
    read("src/app/api/schools/[id]/branding/route.ts"),
  ]);
  assert.doesNotMatch(companyRoute, /"educator"|"student"/);
  assert.doesNotMatch(unitRoute, /auth\.role === "educator"|auth\.role === "student"/);
  assert.doesNotMatch(companyRoute, /input\.companyId|input\.schoolId/);
  assert.doesNotMatch(unitRoute, /input\.companyId|input\.schoolId/);
});

test("resolved branding endpoint binds school and company tenant scope", async () => {
  const route = await read("src/app/api/branding/route.ts");
  assert.match(route, /_id: auth\.schoolId/);
  assert.match(route, /companyId: auth\.companyId/);
  assert.match(route, /school\?\.companyId \?\? auth\.companyId/);
});

test("provider identity is permanent and not accepted by tenant APIs", async () => {
  assert.deepEqual(PROVIDER_IDENTITY, {
    shortName: "GFarS",
    fullName: "GFarS Soluções Inteligentes",
  });
  const [companyRoute, unitRoute, settings, dashboard] = await Promise.all([
    read("src/app/api/company/branding/route.ts"),
    read("src/app/api/schools/[id]/branding/route.ts"),
    read("src/components/BrandingSettings.tsx"),
    read("src/app/dashboard/page.tsx"),
  ]);
  assert.doesNotMatch(companyRoute, /"providerName"|"providerIdentity"|"vendorName"/);
  assert.doesNotMatch(unitRoute, /"providerName"|"providerIdentity"|"vendorName"/);
  assert.match(settings, /PROVIDER_IDENTITY\.shortName/);
  assert.match(dashboard, />\s*GFarS\s*</);
  assert.doesNotMatch(settings, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(dashboard, /dangerouslySetInnerHTML/);
});

test("company and unit restoration only unset tenant branding data", async () => {
  const [companyRoute, unitRoute] = await Promise.all([
    read("src/app/api/company/branding/route.ts"),
    read("src/app/api/schools/[id]/branding/route.ts"),
  ]);
  assert.match(companyRoute, /\$unset = \{ "branding\.displayName": "" \}/);
  assert.match(unitRoute, /\$unset = \{ "branding\.displayName": "" \}/);
  assert.doesNotMatch(companyRoute, /GFarS.*\$unset|\$unset.*GFarS/);
  assert.doesNotMatch(unitRoute, /GFarS.*\$unset|\$unset.*GFarS/);
});

test("existing logo and color inheritance remains intact with display names", () => {
  const company = {
    branding: {
      displayName: "Grupo Curitiba",
      logoUrl: "https://example.test/company.png",
      primaryColor: "#123456",
      secondaryColor: "#234567",
      accentColor: "#345678",
      allowUnitBranding: true,
      allowUnitDisplayName: true,
    },
  };
  const school = {
    branding: {
      displayName: "Unidade Centro",
      logoUrl: "https://example.test/unit.png",
      primaryColor: "#456789",
    },
  };
  const result = resolveEffectiveBranding(company, school);
  assert.equal(result.logoUrl, "https://example.test/unit.png");
  assert.equal(result.primaryColor, "#456789");
  assert.equal(result.secondaryColor, "#234567");
  assert.equal(result.accentColor, "#345678");
  assert.equal(result.displayName, "Unidade Centro");
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
  assert.match(manifest, /short_name: "SUPERPONTOS"/);
  assert.match(manifest, /superpontos-icon-192\.png/);
  assert.match(manifest, /superpontos-icon-512\.png/);
  assert.doesNotMatch(manifest, /branding|company|school|tenant|displayName/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(layout, /favicon-32x32\.png/);
  assert.match(layout, /applicationName: 'SUPERPONTOS'/);
  assert.match(worker, /superpontos-icon-192\.png/);
  assert.match(worker, /push/);
  assert.match(worker, /notificationclick/);
  assert.doesNotMatch(worker, /displayName|tenant-branding/);
});

test("branding changes do not introduce Asaas or financial mutations", async () => {
  const sources = await Promise.all([
    read("src/lib/tenant-branding.ts"),
    read("src/app/api/branding/route.ts"),
    read("src/app/api/company/branding/route.ts"),
    read("src/app/api/schools/[id]/branding/route.ts"),
    read("src/components/BrandingSettings.tsx"),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /asaas|checkout|subscription|billing provider/i);
  }
});
