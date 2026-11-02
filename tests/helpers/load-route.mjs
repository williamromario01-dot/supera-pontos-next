import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const nativeRequire = createRequire(import.meta.url);
export function loadRoute(filename, mocks = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const compiledModule = { exports: {} };
    cache.set(absolute, compiledModule);
    const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = name => {
      if (name in mocks) return mocks[name];
      if (name.startsWith("@/")) return load(path.resolve("src", name.slice(2)) + ".ts");
      if (name.startsWith(".")) return load(path.resolve(path.dirname(absolute), name.endsWith(".ts") ? name : name + ".ts"));
      return nativeRequire(name);
    };
    new Function("exports", "module", "require", code)(compiledModule.exports, compiledModule, require);
    return compiledModule.exports;
  }
  return load(filename);
}
