import { describe, expect, it } from '@jest/globals';

import { __resetUuidV7ForTest, uuidv7 } from './uuidv7';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('格式正确：版本位 7、变体位 8-b', () => {
    const id = uuidv7({ now: () => 0x0192_0000_0000, randomBytes: (n) => new Uint8Array(n) });
    expect(id).toMatch(UUID_RE);
  });

  it('时间戳前缀随时间单调递增（可排序）', () => {
    __resetUuidV7ForTest();
    const a = uuidv7({ now: () => 1000, randomBytes: (n) => new Uint8Array(n) });
    const b = uuidv7({ now: () => 2000, randomBytes: (n) => new Uint8Array(n) });
    expect(a.replace(/-/g, '') < b.replace(/-/g, '')).toBe(true);
  });

  it('同一毫秒内不重复且递增（单调序列）', () => {
    __resetUuidV7ForTest();
    const fixed = () => 0x0193_1234_5678;
    const ids = Array.from({ length: 5 }, () =>
      uuidv7({ now: fixed, randomBytes: (n) => new Uint8Array(n) }),
    );
    const set = new Set(ids);
    expect(set.size).toBe(5);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it('随机位被纳入（不同 random 产生不同 id）', () => {
    __resetUuidV7ForTest();
    let counter = 0;
    const rand = (n: number) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) out[i] = (counter++ * 7 + i) & 0xff;
      return out;
    };
    const a = uuidv7({ now: () => 5000, randomBytes: rand });
    counter = 100;
    const b = uuidv7({ now: () => 6000, randomBytes: rand });
    expect(a).not.toBe(b);
  });
});
