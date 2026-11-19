export const SOVRACK_PASSWORD_MIN_LENGTH = 12;
export const SOVRACK_PASSWORD_MAX_LENGTH = 128;

export const SOVRACK_PASSWORD_MESSAGE =
  "Le mot de passe doit contenir 12 à 128 caractères, une majuscule, une minuscule et un chiffre.";

export function isSovrackPassword(value: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/.test(value);
}
