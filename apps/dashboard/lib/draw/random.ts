// Uniform index in [0, upperExclusive). A plain `% n` on a 32-bit value biases
// the low indices, so values in the ragged top partition are rejected and redrawn.
export function secureNextIndex(upperExclusive: number): number {
  if (!Number.isInteger(upperExclusive) || upperExclusive <= 0) {
    throw new RangeError(`upperExclusive must be a positive integer, got ${upperExclusive}`);
  }

  const limit = Math.floor(0x1_0000_0000 / upperExclusive) * upperExclusive;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % upperExclusive;
}
