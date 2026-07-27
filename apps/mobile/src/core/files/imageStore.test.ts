import { describe, expect, it } from '@jest/globals';

import type { CryptoAdapter, DimReader, FsAdapter } from './imageStore';
import { originalExists, stageImage } from './imageStore';

interface FakeFsOpts {
  copyThrows?: boolean;
  readThrows?: boolean;
}

function makeFs(opts: FakeFsOpts = {}) {
  const files = new Map<string, string>(); // absPath -> base64
  const sizes = new Map<string, number>();
  const calls = { copy: 0, move: 0, delete: 0 };
  const fs: FsAdapter = {
    ensureDirs: () => undefined,
    copyToStaged: (src, dst) => {
      calls.copy += 1;
      if (opts.copyThrows) throw new Error('source unreadable');
      files.set(dst, `B64(${src})`);
      sizes.set(dst, 999);
    },
    moveStagedToFinal: (staged, final) => {
      calls.move += 1;
      const b = files.get(staged);
      if (b == null) throw new Error('staged missing');
      files.delete(staged);
      sizes.delete(staged);
      files.set(final, b);
      sizes.set(final, 999);
    },
    deleteIfExists: (p) => {
      calls.delete += 1;
      files.delete(p);
      sizes.delete(p);
    },
    exists: (p) => files.has(p),
    size: (p) => sizes.get(p) ?? 0,
    readBase64: (p) => {
      if (opts.readThrows) throw new Error('read failed');
      return files.get(p) ?? '';
    },
  };
  return { fs, files, calls };
}

const crypto: CryptoAdapter = { sha256Base64: (b) => `HASH(${b})` };
const dims: DimReader = async () => ({ width: 100, height: 200 });
const baseDeps = {
  crypto,
  dims,
  rootAbs: '/priv',
  newId: () => 'id1',
  ext: 'jpg',
};

describe('imageStore 编排', () => {
  it('源不可读：抛错且不留下暂存文件', async () => {
    const { fs, files, calls } = makeFs({ copyThrows: true });
    await expect(
      stageImage('content://photo/1', { ...baseDeps, fs }),
    ).rejects.toThrow('source unreadable');
    expect(calls.copy).toBe(1);
    expect(files.size).toBe(0); // 无孤儿
  });

  it('计算阶段失败：删除暂存文件（无孤儿）', async () => {
    const { fs, files, calls } = makeFs({ readThrows: true });
    await expect(
      stageImage('content://photo/1', { ...baseDeps, fs }),
    ).rejects.toThrow('read failed');
    expect(calls.delete).toBe(1);
    expect(files.size).toBe(0);
  });

  it('成功暂存：给出哈希/尺寸/大小，且 abort 删除暂存', async () => {
    const { fs, files } = makeFs();
    const staged = await stageImage('content://photo/1', { ...baseDeps, fs });
    expect(staged.sha256).toBe('HASH(B64(content://photo/1))');
    expect(staged.width).toBe(100);
    expect(staged.bytes).toBe(999);
    expect(staged.mimeType).toBe('image/jpeg');
    expect(files.size).toBe(1);
    await staged.abort();
    expect(files.size).toBe(0); // 取消即清理
  });

  it('commit：暂存晋升为 originals/<id>.jpg，abort 不再删它', async () => {
    const { fs, files } = makeFs();
    const staged = await stageImage('content://photo/1', { ...baseDeps, fs });
    const { relPath, finalAbsPath } = await staged.commit('g1');
    expect(relPath).toBe('originals/g1.jpg');
    expect(finalAbsPath.endsWith('originals\\g1.jpg') || finalAbsPath.endsWith('originals/g1.jpg')).toBe(true);
    expect(files.has(finalAbsPath)).toBe(true);
    expect(staged.stagedAbsPath === undefined || !files.has(staged.stagedAbsPath)).toBe(true);
    await staged.abort(); // 提交后 abort 为 no-op
    expect(files.has(finalAbsPath)).toBe(true); // 最终文件仍在
  });

  it('originalExists：缺失文件返回 false（供可修复状态，不删记录）', async () => {
    const { fs } = makeFs();
    expect(await originalExists('originals/g1.jpg', { fs, rootAbs: '/priv' })).toBe(false);
  });
});
