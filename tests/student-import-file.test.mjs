import test from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import {
  MAX_STUDENT_IMPORT_FILE_SIZE,
  StudentImportFileError,
  parseStudentImportFile,
} from "../src/lib/student-import-file.ts";

const xml = (value) => strToU8(value);
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function createXlsx(rows, { includeSheet = true } = {}) {
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const sheets = includeSheet ? '<sheets><sheet name="Alunos" sheetId="1" r:id="rId1"/></sheets>' : "<sheets/>";
  const files = {
    "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${includeSheet ? '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' : ""}</Types>`),
    "_rels/.rels": xml('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": xml(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${sheets}</workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${includeSheet ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' : ""}<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": xml('<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>'),
  };
  if (includeSheet) files["xl/worksheets/sheet1.xml"] = xml(sheetXml);
  return Buffer.from(zipSync(files));
}

test("parses a valid XLSX without executing formulas", async () => {
  const fixture = createXlsx([["nome", "email", "senha"], ["Ana", "ana@example.com", "segura123"]]);
  const rows = await parseStudentImportFile(fixture, "alunos.xlsx");
  assert.deepEqual(rows, [{ nome: "Ana", email: "ana@example.com", senha: "segura123" }]);
});

test("preserves valid CSV import", async () => {
  const rows = await parseStudentImportFile(Buffer.from("nome,email,senha\nAna,ana@example.com,segura123\n"), "alunos.csv");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "ana@example.com");
});

test("rejects invalid, empty, oversized and sheetless workbooks", async () => {
  for (const [buffer, name] of [
    [Buffer.alloc(0), "empty.xlsx"],
    [Buffer.from("not a zip"), "fake.xlsx"],
    [Buffer.alloc(MAX_STUDENT_IMPORT_FILE_SIZE + 1), "large.xlsx"],
    [createXlsx([], { includeSheet: false }), "sheetless.xlsx"],
  ]) {
    await assert.rejects(parseStudentImportFile(buffer, name), StudentImportFileError);
  }
});

test("rejects more than 500 data records", async () => {
  const lines = ["nome,email,senha"];
  for (let index = 0; index < 501; index++) lines.push(`Aluno ${index},a${index}@example.com,segura123`);
  await assert.rejects(
    parseStudentImportFile(Buffer.from(lines.join("\n")), "alunos.csv"),
    (error) => error instanceof StudentImportFileError && error.code === "TOO_MANY_ROWS",
  );
});

test("rejects formula-injection prefixes as data", async () => {
  for (const prefix of ["=", "+", "-", "@"]) {
    await assert.rejects(
      parseStudentImportFile(Buffer.from(`nome,email,senha\n${prefix}cmd,ana@example.com,segura123\n`), "alunos.csv"),
      (error) => error instanceof StudentImportFileError && error.code === "UNSAFE_CELL",
    );
  }
});

test("route keeps tenant, company and duplicate protections", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../src/app/api/students/import/route.ts", import.meta.url), "utf8"));
  assert.match(source, /String\(user\.schoolId\) !== String\(schoolId\)/);
  assert.match(source, /ObjectId\.isValid\(String\(school\.companyId\)\)/);
  assert.match(source, /existingEmails\.has\(student\.email\)/);
  assert.match(source, /role: "student"/);
});
