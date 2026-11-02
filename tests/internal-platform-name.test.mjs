import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as branding from "../src/lib/tenant-branding.ts";
function load(path, dependencies) {
  const compiled = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("exports", "module", "React", "require", compiled)(
    compiledModule.exports, compiledModule, React, name => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    });
  return compiledModule.exports;
}
const theme = load("src/components/TenantTheme.tsx", { react: React, "@/lib/tenant-branding": branding });
const Name = load("src/components/InternalPlatformName.tsx", { react: React, "@/components/TenantTheme": theme }).default;
function render(value, props) {
  return renderToStaticMarkup(React.createElement(theme.TenantBrandingContext.Provider, { value }, React.createElement(Name, props)));
}
test("gradient follows server-resolved authorized colors and names", () => {
  const company = { branding: { primaryColor: "#2563eb", displayName: "Col\u00e9gio Evolu\u00e7\u00e3o" } };
  const unit = { branding: { primaryColor: "#16a34a", displayName: "Unidade Centro" } };
  const cases = [
    [null, null, "#f97316", "SUPERPONTOS"],
    [company, null, "#2563eb", company.branding.displayName],
    [company, unit, "#2563eb", company.branding.displayName],
    [{ branding: { ...company.branding, allowUnitBranding: true, allowUnitDisplayName: true } }, unit, "#16a34a", "Unidade Centro"],
    [{ branding: { ...company.branding, allowUnitBranding: true } }, { branding: { primaryColor: "invalid" } }, "#2563eb", company.branding.displayName],
  ];
  for (const [companyValue, school, color, name] of cases) {
    const markup = render(branding.resolveEffectiveBranding(companyValue, school));
    assert.ok(markup.includes(`--brand-primary:${color}`));
    assert.ok(markup.includes(`>${name}</span>`));
    assert.equal((markup.match(/<span/g) ?? []).length, 1);
  }
});
test("resolved name remains escaped and uses the existing brand token", () => {
  assert.ok(render(branding.PLATFORM_BRANDING, { displayName: "<script>" }).includes("&lt;script&gt;"));
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /linear-gradient\(90deg, #000 0%, var\(--brand-primary\) 100%\)/);
  assert.match(css, /forced-colors: active/);
});
