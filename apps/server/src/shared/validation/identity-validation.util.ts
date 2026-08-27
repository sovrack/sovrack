import { Transform } from 'class-transformer';
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
  type ValidationOptions,
} from 'class-validator';

export const SOVRACK_PASSWORD_OPENAPI = {
  minLength: 12,
  maxLength: 128,
  pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$',
} as const;

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmailAddress(value) : value,
  );
}

export function IsSovrackPassword(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })(
      target,
      propertyKey,
    );
    MinLength(12, {
      message: 'Le mot de passe doit contenir au moins 12 caractères',
      ...validationOptions,
    })(target, propertyKey);
    MaxLength(128, {
      message: 'Le mot de passe ne peut pas dépasser 128 caractères',
      ...validationOptions,
    })(target, propertyKey);
    Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
      message:
        'Le mot de passe doit contenir une majuscule, une minuscule et un chiffre',
      ...validationOptions,
    })(target, propertyKey);
  };
}
