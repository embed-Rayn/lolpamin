import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { BinaryLike, ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify<BinaryLike, BinaryLike, number, ScryptOptions, Buffer>(scrypt);

const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
// N=16384, r=8이면 128 * N * r = 16MB가 필요하다. Node 기본 상한(32MB)으로는
// 충분하지만, 저장 문자열이 깨져 큰 값이 들어와도 프로세스를 못 죽이도록 상한을 고정한다.
const MAX_MEMORY = 64 * 1024 * 1024;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(plain, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, costRaw, blockSizeRaw, parallelizationRaw, saltBase64, keyBase64] = parts;
  const cost = Number(costRaw);
  const blockSize = Number(blockSizeRaw);
  const parallelization = Number(parallelizationRaw);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) {
    return false;
  }

  const salt = Buffer.from(saltBase64, "base64");
  const key = Buffer.from(keyBase64, "base64");
  if (salt.length === 0 || key.length === 0) return false;

  try {
    const derived = await scryptAsync(plain, salt, key.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: MAX_MEMORY,
    });
    return timingSafeEqual(derived, key);
  } catch {
    return false;
  }
}
