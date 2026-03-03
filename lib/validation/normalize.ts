export function trimOrNull(value: string | null | undefined) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function trimOrEmpty(value: string) {
  return value.trim();
}

export function upperOrNull(value: string | null | undefined) {
  const trimmed = trimOrNull(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

export function lowerOrEmpty(value: string) {
  return value.trim().toLowerCase();
}
