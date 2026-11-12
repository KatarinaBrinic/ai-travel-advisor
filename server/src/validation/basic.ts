export class ValidationError extends Error {}

export function assertOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`);
  }
  return value;
}

export function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${field} is required and must be a non-empty string`);
  }
  return value;
}
