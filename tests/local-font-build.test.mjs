import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("production build uses the licensed local Inter font without a Google Fonts request", async () => {
  const [layout, license, font] = await Promise.all([
    readFile("src/app/layout.tsx", "utf8"),
    readFile("src/app/fonts/inter/OFL.txt", "utf8"),
    readFile("src/app/fonts/inter/Inter-Variable.ttf"),
  ]);
  assert.match(layout, /from ['"]next\/font\/local['"]/);
  assert.match(layout, /Inter-Variable\.ttf/);
  assert.match(layout, /weight: ['"]100 900['"]/);
  assert.doesNotMatch(layout, /next\/font\/google|fonts\.googleapis\.com/);
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.ok(font.length > 100_000, "the checked-in font must not be an empty placeholder");
});
