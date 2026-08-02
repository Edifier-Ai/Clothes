/**
 * 真实样本导入：把 .private/import/ 下已下载的公开数据集 JPG 转成基准 PNG + GT alpha，
 * 并按既有 schema 追加进 .private/manifest.json（幂等：先剔除旧的 real-* 条目再追加）。
 *
 * 用法：npx tsx scripts/segmentation-benchmark/importRealSamples.ts
 *
 * 样本来源（下载方式见 git 历史与 notes 字段；原始 JPG 与挑选清单在 .private/import/，不入库）：
 * 1. ModaNet（https://github.com/eBay/modanet，标注 CC BY-NC 4.0）：街拍人物着装图，
 *    多边形分割标注（COCO 风格）。图像本体经镜像 release
 *    https://github.com/cad0p/maskrcnn-modanet/releases/tag/v0.9 的 images.zip 按 Range 抽取，
 *    标注取自官方 modanet2018_instances_train.json（md5 96478657d20e322e9d3282c6d73c0c4c）。
 *    GT = 该图全部衣物类别多边形标注的并集，灰度 255=衣物前景。
 * 2. clothing-dataset-small（https://github.com/alexeygrigorev/clothing-dataset-small，
 *    README 声明 "freely used for any purpose"）：电商白底商品图，无分割标注，
 *    GT 为全零占位，notes 标 "no-gt, human judgement required"。
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import * as jpeg from 'jpeg-js';

import type { Manifest, ManifestEntry } from './generateFixtures';
import { encodeAlphaPNG, encodePNG, type RGBA } from './pngUtil';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '.private');
const IMG = join(OUT, 'images');
const GT = join(OUT, 'ground_truth');
const IMPORT = join(OUT, 'import');
const MAX_LONG_EDGE = 1024;

const CAT_NAMES: Record<number, string> = {
  1: 'bag',
  2: 'belt',
  3: 'boots',
  4: 'footwear',
  5: 'outer',
  6: 'dress',
  7: 'sunglasses',
  8: 'pants',
  9: 'top',
  10: 'shorts',
  11: 'skirt',
  12: 'headwear',
  13: 'scarf/tie',
};

interface ModaNetPick {
  image_id: number;
  file_name: string;
  width: number;
  height: number;
  anns: Array<{ category_id: number; area: number; segmentation: number[][] }>;
}

function decodeJpeg(path: string): RGBA {
  const dec = jpeg.decode(readFileSync(path), { maxMemoryUsageInMB: 1024 });
  return { width: dec.width, height: dec.height, data: Buffer.from(dec.data.buffer, dec.data.byteOffset, dec.data.byteLength) };
}

/** 最近邻缩放到长边 ≤ maxLong；返回缩放后图像与 x/y 方向缩放系数。 */
function resizeToFit(src: RGBA, maxLong: number): { out: RGBA; sx: number; sy: number } {
  const long = Math.max(src.width, src.height);
  if (long <= maxLong) return { out: src, sx: 1, sy: 1 };
  const s = maxLong / long;
  const w = Math.max(1, Math.round(src.width * s));
  const h = Math.max(1, Math.round(src.height * s));
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / s));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / s));
      const si = (sy * src.width + sx) * 4;
      const di = (y * w + x) * 4;
      data[di] = src.data[si];
      data[di + 1] = src.data[si + 1];
      data[di + 2] = src.data[si + 2];
      data[di + 3] = src.data[si + 3];
    }
  }
  return { out: { width: w, height: h, data }, sx: w / src.width, sy: h / src.height };
}

/** 把 COCO 风格多边形（flat [x1,y1,...] 数组的数组）按 even-odd 扫描线填充为 0/255 灰度并集。 */
function rasterizePolygons(anns: ModaNetPick['anns'], w: number, h: number, sx: number, sy: number): Uint8Array {
  const alpha = new Uint8Array(w * h);
  for (const ann of anns) {
    for (const flat of ann.segmentation) {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i] * sx, flat[i + 1] * sy]);
      if (pts.length < 3) continue;
      for (let y = 0; y < h; y++) {
        const yc = y + 0.5;
        const xs: number[] = [];
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > yc !== yj > yc) xs.push(xi + ((yc - yi) / (yj - yi)) * (xj - xi));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
          const x1 = Math.min(w - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
          for (let x = x0; x <= x1; x++) alpha[y * w + x] = 255;
        }
      }
    }
  }
  return alpha;
}

function buildModaNetEntries(): ManifestEntry[] {
  const picks = JSON.parse(readFileSync(join(IMPORT, 'modanet_picks.json'), 'utf8')) as ModaNetPick[];
  const entries: ManifestEntry[] = [];
  for (const p of picks) {
    const jpgPath = join(IMPORT, 'jpg', 'modanet', p.file_name);
    if (!existsSync(jpgPath)) throw new Error(`missing staged jpg: ${jpgPath}`);
    const src = decodeJpeg(jpgPath);
    if (src.width !== p.width || src.height !== p.height) {
      // eslint-disable-next-line no-console
      console.warn(`WARN ${p.file_name}: jpg ${src.width}x${src.height} != annotation ${p.width}x${p.height}`);
    }
    const { out, sx, sy } = resizeToFit(src, MAX_LONG_EDGE);
    const id = `real-mn-${p.file_name.replace(/\.jpg$/, '')}`;
    const alpha = rasterizePolygons(p.anns, out.width, out.height, sx, sy);
    const fg = alpha.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    if (fg === 0) throw new Error(`empty GT rasterized for ${p.file_name}`);
    writeFileSync(join(IMG, `${id}.png`), encodePNG(out));
    writeFileSync(join(GT, `${id}.png`), encodeAlphaPNG(alpha, out.width, out.height));
    const cats = p.anns.map((a) => CAT_NAMES[a.category_id] ?? String(a.category_id)).join('+');
    entries.push({
      id,
      image: `images/${id}.png`,
      groundTruthAlpha: `ground_truth/${id}.png`,
      humanJudgement: null,
      notes:
        `source: https://github.com/eBay/modanet (annotations CC BY-NC 4.0); ` +
        `image via mirror https://github.com/cad0p/maskrcnn-modanet/releases/tag/v0.9 images.zip#images/${p.file_name}; ` +
        `GT = union of ${p.anns.length} ModaNet polygon ann(s), cats: ${cats}; person-worn street photo, 400x600`,
    });
  }
  return entries;
}

function buildCdsEntries(): ManifestEntry[] {
  const picks = JSON.parse(readFileSync(join(IMPORT, 'cds_picks.json'), 'utf8')) as string[];
  const entries: ManifestEntry[] = [];
  for (const repoPath of picks) {
    const base = repoPath.split('/').pop()!;
    const cat = repoPath.split('/')[1];
    const jpgPath = join(IMPORT, 'jpg', 'cds', base);
    if (!existsSync(jpgPath)) throw new Error(`missing staged jpg: ${jpgPath}`);
    const src = decodeJpeg(jpgPath);
    const { out } = resizeToFit(src, MAX_LONG_EDGE);
    const id = `real-cds-${cat}-${base.replace(/\.jpg$/, '').slice(0, 8)}`;
    const alpha = new Uint8Array(out.width * out.height); // 全零占位：无分割标注
    writeFileSync(join(IMG, `${id}.png`), encodePNG(out));
    writeFileSync(join(GT, `${id}.png`), encodeAlphaPNG(alpha, out.width, out.height));
    entries.push({
      id,
      image: `images/${id}.png`,
      groundTruthAlpha: `ground_truth/${id}.png`,
      humanJudgement: null,
      notes:
        `no-gt, human judgement required; ` +
        `source: https://github.com/alexeygrigorev/clothing-dataset-small/blob/master/${repoPath} ` +
        `(README: "can be freely used for any purpose"); e-commerce product photo, category ${cat}`,
    });
  }
  return entries;
}

function main(): void {
  const realEntries = [...buildModaNetEntries(), ...buildCdsEntries()];
  const manifestPath = join(OUT, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const kept = manifest.entries.filter((e) => !e.id.startsWith('real-'));
  const next: Manifest = {
    ...manifest,
    source: 'public-dataset',
    generatedAt: new Date().toISOString(),
    entries: [...kept, ...realEntries],
    count: kept.length + realEntries.length,
  };
  writeFileSync(manifestPath, JSON.stringify(next, null, 2));
  // eslint-disable-next-line no-console
  console.log(`imported ${realEntries.length} real samples (kept ${kept.length} synthetic) -> manifest count=${next.count}`);
}

main();
