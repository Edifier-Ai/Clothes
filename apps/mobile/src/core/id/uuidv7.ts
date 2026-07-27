/**
 * UUIDv7 生成器（TECH_STACK：ID 使用 UUIDv7）。
 *
 * 布局：48 位 unix_ms | 4 位版本(0111) | 12 位 rand_a | 2 位变体(10) | 62 位 rand_b。
 * 同一毫秒内用单调递增的 rand_a 保证有序且不重复；可注入 clock/random 以便测试。
 */

export interface UuidV7Deps {
  now?: () => number;
  randomBytes?: (n: number) => Uint8Array;
}

let lastMs = -1;
let seq = 0;

function defaultRandom(n: number): Uint8Array {
  // expo-crypto 在设备提供 getRandomValues；node 测试用 crypto.webcrypto。
  // 这里只做兜底，真实注入由调用方/平台提供。
  const out = new Uint8Array(n);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(out);
  } else {
    for (let i = 0; i < n; i += 1) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

const HEX = '0123456789abcdef';

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) {
    s += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f];
  }
  return s;
}

export function uuidv7(deps: UuidV7Deps = {}): string {
  const now = deps.now ?? Date.now;
  const rand = deps.randomBytes ?? defaultRandom;
  let ms = now();
  if (ms <= lastMs) {
    ms = lastMs;
    seq = (seq + 1) & 0x0fff; // 12 位回绕
  } else {
    lastMs = ms;
    seq = 0;
  }

  const bytes = rand(10); // 80 位随机，随后覆盖版本/变体/时间相关位
  const buf = new Uint8Array(16);

  // 时间戳 48 位（大端）→ bytes 0..5
  buf[0] = (ms / 0x10000000000) & 0xff;
  buf[1] = (ms / 0x100000000) & 0xff;
  buf[2] = (ms / 0x1000000) & 0xff;
  buf[3] = (ms / 0x10000) & 0xff;
  buf[4] = (ms / 0x100) & 0xff;
  buf[5] = ms & 0xff;

  // rand_a 12 位 + 版本 0111 → bytes 6..7
  buf[6] = 0x70 | ((seq >> 8) & 0x0f);
  buf[7] = seq & 0xff;

  // 变体 10 + rand_b 高 6 位 → byte 8；其余 rand_b → bytes 9..15
  buf[8] = 0x80 | (bytes[2] & 0x3f);
  buf[9] = bytes[3];
  buf[10] = bytes[4];
  buf[11] = bytes[5];
  buf[12] = bytes[6];
  buf[13] = bytes[7];
  buf[14] = bytes[8];
  buf[15] = bytes[9];

  const h = toHex(buf);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** 仅测试用：重置单调序列状态。 */
export function __resetUuidV7ForTest(): void {
  lastMs = -1;
  seq = 0;
}
