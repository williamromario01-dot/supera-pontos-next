import { readSheet } from "read-excel-file/node";
import { parse as parseCsv } from "csv-parse/sync";

export const MAX_STUDENT_IMPORT_FILE_SIZE = 1024 * 1024;
export const MAX_STUDENT_IMPORT_ROWS = 500;

export class StudentImportFileError extends Error {
  readonly code: "INVALID_FILE" | "EMPTY_WORKBOOK" | "TOO_MANY_ROWS" | "UNSAFE_CELL";

  constructor(
    message: string,
    code:
      | "INVALID_FILE"
      | "EMPTY_WORKBOOK"
      | "TOO_MANY_ROWS"
      | "UNSAFE_CELL",
  ) {
    super(message);
    this.name = "StudentImportFileError";
    this.code = code;
  }
}

type ScalarCell = string | number | boolean | Date | null;

function isXlsx(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

function scalarValue(value: unknown): ScalarCell {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }
  throw new StudentImportFileError(
    "A planilha contem um tipo de celula nao suportado.",
    "UNSAFE_CELL",
  );
}

function rejectFormulaLikeValue(value: ScalarCell): void {
  if (
    typeof value === "string" &&
    /^[=+\-@]/.test(value.trimStart())
  ) {
    throw new StudentImportFileError(
      "A planilha contem uma celula com formula ou comando nao permitido.",
      "UNSAFE_CELL",
    );
  }
}

function rowsToObjects(rows: unknown[][]): Record<string, unknown>[] {
  if (rows.length === 0) {
    throw new StudentImportFileError(
      "A planilha nao possui nenhuma aba ou linha.",
      "EMPTY_WORKBOOK",
    );
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((value) => String(scalarValue(value) ?? "").trim());
  if (!headers.some(Boolean)) {
    throw new StudentImportFileError(
      "A planilha nao possui cabecalhos validos.",
      "EMPTY_WORKBOOK",
    );
  }

  const nonEmptyRows = dataRows.filter((row) =>
    row.some((value) => String(value ?? "").trim() !== ""),
  );
  if (nonEmptyRows.length > MAX_STUDENT_IMPORT_ROWS) {
    throw new StudentImportFileError(
      `A planilha pode conter no maximo ${MAX_STUDENT_IMPORT_ROWS} alunos.`,
      "TOO_MANY_ROWS",
    );
  }

  return nonEmptyRows.map((row) => {
    const result: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const value = scalarValue(row[index] ?? null);
      rejectFormulaLikeValue(value);
      result[header] = value ?? "";
    });
    return result;
  });
}

export async function parseStudentImportFile(
  buffer: Buffer,
  fileName: string,
): Promise<Record<string, unknown>[]> {
  if (buffer.length === 0 || buffer.length > MAX_STUDENT_IMPORT_FILE_SIZE) {
    throw new StudentImportFileError(
      "A planilha deve ter entre 1 byte e 1 MB.",
      "INVALID_FILE",
    );
  }

  const lowerName = fileName.trim().toLowerCase();
  try {
    if (lowerName.endsWith(".xlsx")) {
      if (!isXlsx(buffer)) {
        throw new StudentImportFileError(
          "O conteudo nao corresponde a um arquivo .xlsx valido.",
          "INVALID_FILE",
        );
      }
      return rowsToObjects(await readSheet(buffer));
    }

    if (lowerName.endsWith(".csv")) {
      if (isXlsx(buffer) || buffer.includes(0)) {
        throw new StudentImportFileError(
          "O conteudo nao corresponde a um arquivo CSV valido.",
          "INVALID_FILE",
        );
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      const rows = parseCsv(text, {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: true,
        to_line: MAX_STUDENT_IMPORT_ROWS + 2,
      }) as unknown[][];
      return rowsToObjects(rows);
    }
  } catch (error) {
    if (error instanceof StudentImportFileError) throw error;
    throw new StudentImportFileError(
      "Nao foi possivel ler a planilha.",
      "INVALID_FILE",
    );
  }

  throw new StudentImportFileError(
    "Formato nao permitido. Envie um arquivo .xlsx ou .csv.",
    "INVALID_FILE",
  );
}
