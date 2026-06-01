const unavailableTables = new Set<string>();

function errorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const record = error as { message?: unknown; details?: unknown; code?: unknown };
  return [record.code, record.message, record.details]
    .filter(Boolean)
    .map(value => String(value))
    .join(' ');
}

export function isMissingExpeditionCloudTableError(error: unknown, tableName?: string): boolean {
  const msg = errorMessage(error).toLowerCase();
  if (!msg) return false;
  const tableNeedle = tableName ? tableName.toLowerCase() : '';

  return (
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist') ||
    msg.includes('pgrst205') ||
    msg.includes('pgrst301')
  ) && (!tableNeedle || msg.includes(tableNeedle));
}

export function isExpeditionCloudTableUnavailable(tableName: string): boolean {
  return unavailableTables.has(tableName);
}

export function markExpeditionCloudTableUnavailable(
  tag: string,
  tableName: string,
  error: unknown,
): boolean {
  if (!isMissingExpeditionCloudTableError(error, tableName)) return false;
  if (unavailableTables.has(tableName)) return true;

  unavailableTables.add(tableName);
  if (typeof __DEV__ === 'undefined' || __DEV__) {
    console.warn(tag, `Cloud sync unavailable for ${tableName}; preserving local expedition data.`, {
      reason: errorMessage(error),
    });
  }
  return true;
}

