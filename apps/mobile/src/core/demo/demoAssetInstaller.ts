import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import { originalUri } from '@/core/files/uri';

import { DEMO_GARMENT_CATALOG, type DemoGarmentCatalogItem } from './demoGarmentCatalog';

export interface DemoAssetInstallerDeps {
  resolveSource(source: number): Promise<string>;
  exists(uri: string): Promise<boolean>;
  ensureParent(uri: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  destination(relPath: string): string;
}

const deviceDeps: DemoAssetInstallerDeps = {
  async resolveSource(source) {
    const bundled = Asset.fromModule(source);
    await bundled.downloadAsync();
    const uri = bundled.localUri ?? bundled.uri;
    if (!uri) throw new Error('demo-asset-uri-missing');
    return uri;
  },
  async exists(uri) {
    return (await FileSystem.getInfoAsync(uri)).exists;
  },
  async ensureParent(uri) {
    await FileSystem.makeDirectoryAsync(uri.slice(0, uri.lastIndexOf('/')), { intermediates: true });
  },
  copy(from, to) {
    return FileSystem.copyAsync({ from, to });
  },
  destination: originalUri,
};

/** 把随 APK 分发的只读素材复制到 App 私有 originals 目录；已存在的原图永不覆盖。 */
export async function installBundledDemoAssets(
  catalog: readonly DemoGarmentCatalogItem[] = DEMO_GARMENT_CATALOG,
  deps: DemoAssetInstallerDeps = deviceDeps,
): Promise<void> {
  for (const item of catalog) {
    const destination = deps.destination(item.asset.originalRelPath);
    if (await deps.exists(destination)) continue;
    const source = await deps.resolveSource(item.asset.source);
    await deps.ensureParent(destination);
    await deps.copy(source, destination);
  }
}
