export const DSQL_TRANSACTION_LIMITS = {
  maximumRows: 3_000,
  maximumBytes: 10 * 1024 * 1024,
  recommendedRows: 1_000,
  recommendedBytes: 8 * 1024 * 1024,
} as const;

export interface DsqlBatchOptions {
  readonly maximumRows?: number;
  readonly maximumBytes?: number;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function createDsqlBatches<T>(
  rows: readonly T[],
  options: DsqlBatchOptions = {},
): readonly (readonly T[])[] {
  const maximumRows = options.maximumRows ?? DSQL_TRANSACTION_LIMITS.recommendedRows;
  const maximumBytes = options.maximumBytes ?? DSQL_TRANSACTION_LIMITS.recommendedBytes;

  if (
    !Number.isInteger(maximumRows) ||
    maximumRows <= 0 ||
    maximumRows > DSQL_TRANSACTION_LIMITS.maximumRows
  ) {
    throw new RangeError(
      `maximumRows must be between 1 and ${DSQL_TRANSACTION_LIMITS.maximumRows}.`,
    );
  }
  if (
    !Number.isInteger(maximumBytes) ||
    maximumBytes <= 0 ||
    maximumBytes > DSQL_TRANSACTION_LIMITS.maximumBytes
  ) {
    throw new RangeError(
      `maximumBytes must be between 1 and ${DSQL_TRANSACTION_LIMITS.maximumBytes}.`,
    );
  }

  const batches: T[][] = [];
  let batch: T[] = [];
  let batchBytes = 0;

  for (const row of rows) {
    const rowBytes = utf8ByteLength(JSON.stringify(row));
    if (rowBytes > maximumBytes) {
      throw new RangeError(`A row requires ${rowBytes} bytes, exceeding the batch byte limit.`);
    }

    if (batch.length >= maximumRows || batchBytes + rowBytes > maximumBytes) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }

    batch.push(row);
    batchBytes += rowBytes;
  }

  if (batch.length > 0) batches.push(batch);
  return batches;
}
