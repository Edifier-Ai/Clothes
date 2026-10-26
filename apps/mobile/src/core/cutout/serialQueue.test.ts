import { describe, expect, it } from '@jest/globals';

import { createSerialQueue } from './serialQueue';

describe('createSerialQueue', () => {
  it('任务按提交顺序串行，不重叠', async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const slow = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([enqueue(slow('a', 20)), enqueue(slow('b', 1)), enqueue(slow('c', 1))]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('前一个失败不影响后一个，失败本身仍抛给调用方', async () => {
    const enqueue = createSerialQueue();
    const failing = enqueue(async () => {
      throw new Error('boom');
    });
    const next = enqueue(async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
