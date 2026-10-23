export const AGENDA_COLOR_KEYS = ["orange", "blue", "purple", "green", "red", "pink", "yellow", "cyan"] as const;

export type AgendaColorKey = (typeof AGENDA_COLOR_KEYS)[number];
export const DEFAULT_INSTITUTIONAL_COLOR_KEY: AgendaColorKey = "orange";

export function isAgendaColorKey(value: unknown): value is AgendaColorKey {
  return typeof value === "string" && AGENDA_COLOR_KEYS.includes(value as AgendaColorKey);
}

export function getInstitutionalColorKey(value: unknown): AgendaColorKey {
  return isAgendaColorKey(value) ? value : DEFAULT_INSTITUTIONAL_COLOR_KEY;
}

export function getPersonalColorKeys(institutionalColorKey: AgendaColorKey): AgendaColorKey[] {
  return AGENDA_COLOR_KEYS.filter((colorKey) => colorKey !== institutionalColorKey);
}

function stableIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

export function derivePersonalColorKey(eventId: string, storedColorKey: unknown, institutionalColorKey: AgendaColorKey): AgendaColorKey {
  if (isAgendaColorKey(storedColorKey) && storedColorKey !== institutionalColorKey) return storedColorKey;
  const available = getPersonalColorKeys(institutionalColorKey);
  return available[stableIndex(eventId, available.length)];
}

export function choosePersonalColorKey(eventId: string, institutionalColorKey: AgendaColorKey, colorsAlreadyUsedThatDay: unknown[]): AgendaColorKey {
  const available = getPersonalColorKeys(institutionalColorKey);
  const used = new Set(colorsAlreadyUsedThatDay.filter(isAgendaColorKey));
  const unused = available.filter((colorKey) => !used.has(colorKey));
  const candidates = unused.length > 0 ? unused : available;
  return candidates[stableIndex(eventId, candidates.length)];
}

export function resolvePlannerEventColorKey(type: unknown, eventId: string, storedColorKey: unknown, institutionalColorKey: AgendaColorKey): AgendaColorKey {
  return type === "institutional" ? institutionalColorKey : derivePersonalColorKey(eventId, storedColorKey, institutionalColorKey);
}
