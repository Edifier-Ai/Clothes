/**
 * 基准报告校验：样本数/结果数/缺失输出/透明通道/耗时/汇总一致；并执行阈值判定
 * （usableRate≥80% 且 severeRate≤5% 才绿，否则非零退出 + 报告标红）。
 *
 * 反向验证依赖本脚本：注入损坏样本/模型后，per_image 出现 errored → severeRate>0 →
 * 本脚本非零退出；移除后全绿。
 *
 * 用法：npx tsx scripts/segmentation-benchmark/validateReport.ts --tag NAME [--expect-red]
 *   --expect-red：断言本次应标红（用于反向验证 RED 步），此时 severe>0 视为符合预期，退出 0。
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

import type { Manifest } from './generateFixtures';
import type { PerImageResult, RunReport } from './runBenchmark';

const here = dirname(fileURLToPath(import.meta.url));
const PRIVATE = join(here, '.private');

interface VArgs {
  tag: string;
  expectRed: boolean;
}

function parseArgs(argv: string[]): VArgs {
  const a: VArgs = { tag: 'run', expectRed: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tag') a.tag = argv[++i];
    if (argv[i] === '--expect-red') a.expectRed = true;
  }
  return a;
}

function hasAlphaChannel(pngPath: string): boolean {
  const buf = readFileSync(pngPath);
  const png = PNG.sync.read(buf);
  // ground truth 以灰度存于 RGB；校验图像本身为 RGBA 且尺寸>0
  return png.width > 0 && png.height > 0 && png.data.length === png.width * png.height * 4;
}

export function validate(tag: string, expectRed: boolean): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const manifest = JSON.parse(readFileSync(join(PRIVATE, 'manifest.json'), 'utf8')) as Manifest;
  const reportPath = join(PRIVATE, 'results', tag, 'report.json');
  if (!existsSync(reportPath)) return { ok: false, errors: [`missing report: ${reportPath}`] };
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as RunReport;

  // 1) 每个 manifest 条目对每个可用+不可用候选都有一条 per_image（不得漏样本）
  const segNames = report.segmenters.map((s) => s.name);
  const byId = new Map<string, PerImageResult[]>();
  for (const p of report.perImage) {
    byId.set(p.id, [...(byId.get(p.id) ?? []), p]);
  }
  for (const e of manifest.entries) {
    const rows = byId.get(e.id) ?? [];
    if (rows.length !== segNames.length) {
      errors.push(`sample ${e.id}: expected ${segNames.length} results, got ${rows.length}`);
    }
  }
  // 结果数 == 样本数 × 候选数
  if (report.perImage.length !== manifest.entries.length * segNames.length) {
    errors.push(`result count ${report.perImage.length} != entries*segmenters ${manifest.entries.length * segNames.length}`);
  }
  // 2) 无缺失输出：每条非 errored 必须有 iou 与 ms
  for (const p of report.perImage) {
    if (!p.errored && (p.iou === null || p.ms === null)) {
      errors.push(`${p.id}/${p.segmenter}: non-errored but missing iou/ms`);
    }
  }
  // 3) 透明通道：ground truth PNG 可读且为 RGBA
  for (const e of manifest.entries) {
    const gtPath = join(PRIVATE, e.groundTruthAlpha);
    if (!existsSync(gtPath)) {
      errors.push(`missing ground truth: ${e.groundTruthAlpha}`);
    } else {
      try {
        if (!hasAlphaChannel(gtPath)) errors.push(`ground truth bad rgba: ${e.groundTruthAlpha}`);
      } catch (err) {
        errors.push(`ground truth unreadable (counts as corrupt sample): ${e.groundTruthAlpha}: ${err}`);
      }
    }
  }
  // 4) 汇总一致：summary.total == 该候选 per_image 条数
  for (const s of report.segmenters) {
    const rows = report.perImage.filter((p) => p.segmenter === s.name);
    if (s.summary && s.summary.total !== rows.length) {
      errors.push(`${s.name}: summary.total ${s.summary.total} != per_image ${rows.length}`);
    }
  }
  // 5) 联系表存在
  if (!existsSync(join(PRIVATE, 'results', tag, 'contact_sheet.png'))) errors.push('missing contact_sheet.png');

  // 5b) 任何 errored 条目 → 管线异常（含反向验证注入的损坏样本/模型）→ 标红
  const erroredCount = report.perImage.filter((p) => p.errored).length;
  if (erroredCount > 0) errors.push(`RED: ${erroredCount} errored per-image results (corrupt sample/model or runtime failure)`);

  // 6) 阈值判定：仅对真实样本源启用 80/5 门槛（合成夹具的 stub 不作真实门槛，见 BLOCKED B-5）
  const stub = report.segmenters.find((s) => s.summary);
  const severeRate = stub?.summary?.severeRate ?? 0;
  const usableRate = stub?.summary?.usableRate ?? 0;
  if (report.source === 'real') {
    const redFlag = usableRate < 0.8 || severeRate > 0.05;
    if (expectRed) {
      if (!redFlag && erroredCount === 0) errors.push('expected RED but report is green (reverse-verification failed)');
    } else if (redFlag) {
      errors.push(`RED: usableRate=${(usableRate * 100).toFixed(1)}% severeRate=${(severeRate * 100).toFixed(1)}%`);
    }
  } else if (expectRed) {
    // 合成源的反向验证：靠注入损坏样本产生的 errored 触发；若没 errored 则反向验证失败
    if (erroredCount === 0) errors.push('expected RED (synthetic reverse-verification) but no errored entries');
  }

  return { ok: errors.length === 0, errors };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const { ok, errors } = validate(args.tag, args.expectRed);
  if (ok) {
    // eslint-disable-next-line no-console
    console.log(`validate ${args.tag}: OK${args.expectRed ? ' (RED as expected)' : ''}`);
    process.exit(0);
  }
  // eslint-disable-next-line no-console
  console.error(`validate ${args.tag}: FAIL`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(3);
}

const isMain = process.argv[1]?.includes('validateReport');
if (isMain) main();
