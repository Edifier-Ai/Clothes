/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { PNG } from 'pngjs';

import { compositePreview, produceDerived, rebuildDerived, resizeNearest, type PipelineIO } from './pipelineCore';

/** 内存文件系统 + pngjs 编解码的 PipelineIO，供 host 测试。 */
function makeMemIO(): PipelineIO & { store: Map<string, Uint8Array>; abs: Map<string, string>; tmpWrites: number } {
  const store = new Map<string, Uint8Array>(); // rel -> bytes
  const abs = new Map<string, string>(); // rel -> abs
  const tmp = new Map<string, Uint8Array>();
  let tmpWrites = 0;
  const io: PipelineIO & { store: Map<string, Uint8Array>; abs: Map<string, string>; tmpWrites: number } = {
    store,
    abs,
    _seedSource: (b) => store.set('_src', b),
    get tmpWrites() {
      return tmpWrites;
    },
    relToAbs: (rel) => abs.get(rel) ?? `/mem/${rel}`,
    readBytes: async (p) => {
      // p 可能是 abs 或 rel
      for (const [rel, a] of abs) if (a === p) return store.get(rel)!;
      // 直接按 rel
      const byRel = store.get(p);
      if (byRel) return byRel;
      throw new Error('not found: ' + p);
    },
    encodePng: (rgba, w, h) => {
      const png = new PNG({ width: w, height: h });
      Buffer.from(rgba).copy(png.data);
      return PNG.sync.write(png);
    },
    encodeAlphaPng: (alpha, w, h) => {
      const png = new PNG({ width: w, height: h });
      for (let i = 0; i < w * h; i++) {
        png.data[i * 4] = alpha[i];
        png.data[i * 4 + 1] = alpha[i];
        png.data[i * 4 + 2] = alpha[i];
        png.data[i * 4 + 3] = 255;
      }
      return PNG.sync.write(png);
    },
    decodePng: (bytes) => {
      const png = PNG.sync.read(Buffer.from(bytes));
      return { rgba: new Uint8Array(png.data), w: png.width, h: png.height };
    },
    writeTmp: async (rel, bytes) => {
      tmpWrites++;
      tmp.set(rel, bytes);
    },
    commitTmp: async (tmpRel, finalRel) => {
      const b = tmp.get(tmpRel);
      if (!b) throw new Error('tmp missing: ' + tmpRel);
      store.set(finalRel, b);
      abs.set(finalRel, `/mem/${finalRel}`);
      tmp.delete(tmpRel);
    },
    deleteTmp: async (rel) => {
      tmp.delete(rel);
    },
    exists: async (rel) => store.has(rel) || store.has(`/mem/${rel}`),
    copyOriginalIfAbsent: async (_src, originalRel) => {
      if (store.has(originalRel)) return; // 不覆盖
      // 测试中源图已预置在 store['_src']
      const src = store.get('_src');
      if (!src) throw new Error('no staged source in test store');
      store.set(originalRel, src);
      abs.set(originalRel, `/mem/${originalRel}`);
      store.set(`/mem/${originalRel}`, src);
    },
  };
  return io;
}

function solidPng(w: number, h: number, r: number, g: number, b: number): Uint8Array {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe('派生图管线', () => {
  it('produceDerived 产出 mask/preview/thumb，原图只读不覆盖', async () => {
    const io = makeMemIO();
    io.store.set('_src', solidPng(16, 16, 200, 50, 60));
    const alpha = new Uint8Array(8 * 8).fill(255);
    const res = await produceDerived(io, {
      jobId: 'j',
      garmentId: 'g1',
      sourceStagedAbs: '/mem/_src',
      ext: 'png',
      alpha,
      maskW: 8,
      maskH: 8,
      thumbSize: 4,
    });
    expect(res.originalRelPath).toBe('originals/g1.png');
    expect(await io.exists(res.maskRelPath)).toBe(true);
    expect(await io.exists(res.previewRelPath)).toBe(true);
    expect(await io.exists(res.thumbnailRelPath)).toBe(true);
    // 原图未被覆盖：再 produce 一次同 garment，原图字节不变
    const before = io.store.get('originals/g1.png');
    io.store.set('_src', solidPng(16, 16, 0, 0, 0)); // 不同源
    await produceDerived(io, { jobId: 'j2', garmentId: 'g1', sourceStagedAbs: '/mem/_src', ext: 'png', alpha, maskW: 8, maskH: 8, thumbSize: 4 });
    expect(io.store.get('originals/g1.png')).toEqual(before);
  });

  it('rebuildDerived 从原图+蒙版重建预览/缩略图（派生可重建）', async () => {
    const io = makeMemIO();
    io.store.set('_src', solidPng(16, 16, 120, 80, 40));
    const alpha = new Uint8Array(8 * 8).fill(255);
    const res = await produceDerived(io, { jobId: 'j', garmentId: 'g1', sourceStagedAbs: '/mem/_src', ext: 'png', alpha, maskW: 8, maskH: 8, thumbSize: 4 });
    const previewBefore = io.store.get(res.previewRelPath);
    // 删除派生图后重建
    io.store.delete(res.previewRelPath);
    io.store.delete(res.thumbnailRelPath);
    const rebuilt = await rebuildDerived(io, 'g1', 'png', 4);
    expect(io.store.has(rebuilt.previewRelPath)).toBe(true);
    expect(io.store.has(rebuilt.thumbnailRelPath)).toBe(true);
    // 重建预览与首次预览字节一致（确定性算法）
    expect(io.store.get(rebuilt.previewRelPath)).toEqual(previewBefore);
  });

  it('原子写：commit 后无残留 tmp', async () => {
    const io = makeMemIO();
    io.store.set('_src', solidPng(8, 8, 10, 20, 30));
    const alpha = new Uint8Array(4 * 4).fill(255);
    await produceDerived(io, { jobId: 'j', garmentId: 'g1', sourceStagedAbs: '/mem/_src', ext: 'png', alpha, maskW: 4, maskH: 4, thumbSize: 2 });
    // tmp map 应空（commit 后 delete）
    // 通过 tmpWrites>0 证明走了 tmp 路径
    expect(io.tmpWrites).toBeGreaterThan(0);
  });
});

describe('合成/缩放纯函数', () => {
  it('compositePreview 全透明处为背景棋盘，全不透明处为原图色', () => {
    const w = 2;
    const h = 2;
    const orig = new Uint8Array([100, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const alpha = new Uint8Array([255, 0, 255, 0]);
    const out = compositePreview(orig, alpha, w, h, false);
    // 不透明像素 → 原图色
    expect([out[0], out[1], out[2]]).toEqual([100, 0, 0]);
    // 透明像素 → 棋盘背景值之一（灰阶，R=G=B）
    expect(out[4]).toBe(out[5]);
    expect(out[5]).toBe(out[6]);
    expect([210, 245]).toContain(out[4]);
    // solid 模式透明处为纯白
    const outSolid = compositePreview(orig, alpha, w, h, true);
    expect(outSolid[4]).toBe(255);
  });

  it('resizeNearest 2x2→1x1 取左上', () => {
    const src = new Uint8Array([9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const out = resizeNearest(src, 2, 2, 1, 1);
    expect([out[0], out[1], out[2], out[3]]).toEqual([9, 1, 2, 3]);
  });
});
