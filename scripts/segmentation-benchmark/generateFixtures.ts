/**
 * 生成可复现合成夹具 + 清单（manifest）。
 * 用法：npx tsx scripts/segmentation-benchmark/generateFixtures.ts
 * 输出到 scripts/segmentation-benchmark/.private/（gitignore，不入库）。
 * 真图到位后，按同一 manifest schema 替换 images/ground_truth 即可复用管线。
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { encodeAlphaPNG, encodePNG, makeFixture, type FixtureSpec } from './pngUtil';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '.private');
const IMG = join(OUT, 'images');
const GT = join(OUT, 'ground_truth');

const FGS: Array<[number, number, number]> = [
  [240, 240, 245], // 白衬衫
  [20, 22, 28], // 黑外套
  [122, 46, 58], // 酒红
  [60, 90, 140], // 海军蓝
  [200, 170, 110], // 沙色
  [40, 110, 70], // 绿
];

const BACKGROUNDS: FixtureSpec['bg'][] = ['white', 'black', 'checker', 'busy', 'shadow'];
const EDGES: FixtureSpec['edge'][] = ['none', 'fringe', 'lace'];

function buildSpecs(): FixtureSpec[] {
  const specs: FixtureSpec[] = [];
  let n = 0;
  // 覆盖矩阵：每个背景 × 每个边缘 × 轮换前景/对比，取 24 个有代表性的组合
  for (const bg of BACKGROUNDS) {
    for (const edge of EDGES) {
      const fg = FGS[n % FGS.length];
      const contrast: FixtureSpec['contrast'] =
        (bg === 'white' && fg[0] > 200) || (bg === 'black' && fg[0] < 40) ? 'low' : 'normal';
      specs.push({
        id: `syn-${String(n).padStart(3, '0')}`,
        fg,
        bg,
        rx: 0.32 + (n % 3) * 0.04,
        ry: 0.4 + (n % 2) * 0.05,
        edge,
        contrast,
      });
      n++;
    }
  }
  // 额外硬例：阴影背景 + 流苏 + 低对比
  specs.push({ id: 'syn-hard-shadow-fringe', fg: [30, 30, 36], bg: 'shadow', rx: 0.3, ry: 0.42, edge: 'fringe', contrast: 'low' });
  specs.push({ id: 'syn-hard-busy-lace', fg: [235, 232, 226], bg: 'busy', rx: 0.34, ry: 0.4, edge: 'lace', contrast: 'low' });
  return specs;
}

export interface ManifestEntry extends Partial<FixtureSpec> {
  id: string;
  image: string;
  groundTruthAlpha: string;
  /** 人工判定字段（真图流程填写；合成夹具留空，报告中标注 source=synthetic）。 */
  humanJudgement?: 'usable' | 'marginal' | 'severe' | null;
  notes?: string;
}

export interface Manifest {
  version: 1;
  /** synthetic=合成夹具；real=真实拍摄；public-dataset=公开数据集真实样本（可混合合成条目，见各条 notes）。 */
  source: 'synthetic' | 'real' | 'public-dataset';
  generatedAt: string;
  count: number;
  entries: ManifestEntry[];
}

function main(): void {
  mkdirSync(IMG, { recursive: true });
  mkdirSync(GT, { recursive: true });
  const specs = buildSpecs();
  const entries: ManifestEntry[] = specs.map((spec) => {
    const { image, alpha } = makeFixture(spec);
    writeFileSync(join(IMG, `${spec.id}.png`), encodePNG(image));
    writeFileSync(join(GT, `${spec.id}.png`), encodeAlphaPNG(alpha, image.width, image.height));
    return {
      ...spec,
      image: `images/${spec.id}.png`,
      groundTruthAlpha: `ground_truth/${spec.id}.png`,
      humanJudgement: null,
      notes: 'synthetic fixture; ground truth is exact ellipse mask',
    };
  });
  const manifest: Manifest = {
    version: 1,
    source: 'synthetic',
    generatedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  // eslint-disable-next-line no-console
  console.log(`generated ${entries.length} fixtures -> ${OUT}`);
}

main();
