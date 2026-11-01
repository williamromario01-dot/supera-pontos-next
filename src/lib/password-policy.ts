export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 100;

export function validatePassword(value: unknown): string | null {
  if (typeof value !== "string") {
    return "A nova senha deve ter entre 8 e 100 caracteres.";
  }
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    return "A nova senha deve ter entre 8 e 100 caracteres.";
  }
  return null;
}
