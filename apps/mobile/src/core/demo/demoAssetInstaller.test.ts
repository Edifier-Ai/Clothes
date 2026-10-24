/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals';

import { installBundledDemoAssets, type DemoAssetInstallerDeps } from './demoAssetInstaller';
import type { DemoGarmentCatalogItem } from './demoGarmentCatalog';

function item(suffix: string, source: number): DemoGarmentCatalogItem {
  return {
    suffix,
    name: suffix,
    category: 'top',
    color: '白色',
    material: '棉',
    season: '四季',
    occasion: '日常',
    formality: '日常',
    priceMinor: 100,
    asset: {
      source,
      originalRelPath: `originals/demo-v1-${suffix}.png`,
      sha256: 'a'.repeat(64),
      width: 1254,
      height: 1254,
      bytes: 10,
      mimeType: 'image/png',
    },
  };
}

describe('installBundledDemoAssets', () => {
  it('只复制缺失素材，已有私有原图绝不覆盖', async () => {
    const resolveSource = jest.fn(async (source: number) => `bundle://${source}`);
    const ensureParent = jest.fn(async () => undefined);
    const copy = jest.fn(async () => undefined);
    const deps: DemoAssetInstallerDeps = {
      resolveSource,
      exists: async (uri) => uri.endsWith('top-01.png'),
      ensureParent,
      copy,
      destination: (relPath) => `private://${relPath}`,
    };

    await installBundledDemoAssets([item('top-01', 1), item('top-02', 2)], deps);

    expect(resolveSource).toHaveBeenCalledTimes(1);
    expect(resolveSource).toHaveBeenCalledWith(2);
    expect(ensureParent).toHaveBeenCalledWith('private://originals/demo-v1-top-02.png');
    expect(copy).toHaveBeenCalledWith('bundle://2', 'private://originals/demo-v1-top-02.png');
  });
});
