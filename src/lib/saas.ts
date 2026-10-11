import type { Db, IndexDescriptionInfo } from "mongodb";

export const DB_NAME = "supera_pontos";
export function normalizeDigits(value: unknown): string { return String(value ?? "").replace(/\D/g, ""); }
export function normalizeEmail(value: unknown): string { return String(value ?? "").trim().toLowerCase(); }
export function isValidEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function hasRepeatedDigits(value: string): boolean { return /^(\d)\1+$/.test(value); }

export function isValidCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || hasRepeatedDigits(value)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(value[index]) * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(value[9]) && digit(10) === Number(value[10]);
}

export function isValidCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || hasRepeatedDigits(value)) return false;
  const calculate = (length: 12 | 13) => {
    const weights = length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(value[12]) && calculate(13) === Number(value[13]);
}

function isUniqueIndex(index: IndexDescriptionInfo | undefined): boolean {
  return index?.unique === true;
}

function hasKeys(index: IndexDescriptionInfo | undefined, keys: string[]): boolean {
  if (!index?.key) return false;
  const actualKeys = Object.keys(index.key);
  return actualKeys.length === keys.length &&
    keys.every((key, position) => actualKeys[position] === key && index.key?.[key] === 1);
}

function hasStringPartial(index: IndexDescriptionInfo | undefined, field: string): boolean {
  const filter = index?.partialFilterExpression as Record<string, unknown> | undefined;
  const condition = filter?.[field] as Record<string, unknown> | undefined;
  return condition?.$type === "string";
}

export async function assertCompanyRegistrationIndexes(db: Db): Promise<void> {
  let indexes: IndexDescriptionInfo[];
  let userIndexes: IndexDescriptionInfo[];
  try {
    indexes = await db.collection("companies").listIndexes().toArray();
    userIndexes = await db.collection("users").listIndexes().toArray();
  } catch {
    throw new Error("SAAS_INDEXES_NOT_CONFIGURED");
  }

  const cnpjIndex = indexes.find((index) => index.name === "uniq_company_cnpj");
  const userEmailIndex = userIndexes.find(
    (index) => isUniqueIndex(index) && hasKeys(index, ["email"])
  );

  if (
    !isUniqueIndex(cnpjIndex) ||
    !hasKeys(cnpjIndex, ["cnpj"]) ||
    !hasStringPartial(cnpjIndex, "cnpj") ||
    !isUniqueIndex(userEmailIndex) ||
    !hasKeys(userEmailIndex, ["email"])
  ) {
    throw new Error("SAAS_INDEXES_NOT_CONFIGURED");
  }
}

export async function assertCompanySchoolIndexes(db: Db): Promise<void> {
  let indexes: IndexDescriptionInfo[];
  try {
    indexes = await db.collection("schools").listIndexes().toArray();
  } catch {
    throw new Error("SAAS_INDEXES_NOT_CONFIGURED");
  }
  const nameIndex = indexes.find((index) => index.name === "uniq_company_school_name");
  if (
    !isUniqueIndex(nameIndex) ||
    !hasKeys(nameIndex, ["companyId", "nameKey"]) ||
    !hasStringPartial(nameIndex, "nameKey")
  ) throw new Error("SAAS_INDEXES_NOT_CONFIGURED");
}
