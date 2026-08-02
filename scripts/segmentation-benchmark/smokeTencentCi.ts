/**
 * 腾讯云 GoodsMatting 真实冒烟（1 张图）：验证凭证/签名/上传/抠图/下载/删对象全链路。
 * 不是质量基准——合成图非真实商品，只验证管道连通与返回结构，质量判定走 MVP-002 正式基准。
 *
 * 用法：npx tsx scripts/segmentation-benchmark/smokeTencentCi.ts [图片相对.private的路径]
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { decodePNG } from './pngUtil';
import { loadTencentCiConfigFromFile, TencentCiSegmenter } from './tencentCi';

const here = dirname(fileURLToPath(import.meta.url));
const PRIVATE = join(here, '.private');

async function main(): Promise<void> {
  const rel = process.argv[2] ?? join('images', 'syn-000.png');
  const seg = new TencentCiSegmenter({
    loadConfig: () => loadTencentCiConfigFromFile(join(PRIVATE, 'tencent-ci.json')),
  });
  if (!seg.available) {
    // eslint-disable-next-line no-console
    console.error(`segmenter unavailable: ${seg.unavailableReason}`);
    process.exit(2);
  }
  const image = decodePNG(readFileSync(join(PRIVATE, rel)));
  // eslint-disable-next-line no-console
  console.log(`input ${rel}: ${image.width}x${image.height}`);
  const t0 = Date.now();
  const res = await seg.segment(image);
  let fg = 0;
  for (const v of res.alpha) if (v > 128) fg++;
  // eslint-disable-next-line no-console
  console.log(
    `SMOKE OK: e2e=${Date.now() - t0}ms engine=${res.ms.toFixed(0)}ms alpha=${res.alpha.length}px fg=${((100 * fg) / res.alpha.length).toFixed(1)}%`,
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('SMOKE FAILED:', e);
  process.exit(1);
});
