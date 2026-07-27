/**
 * 基准运行器：读 manifest → 对每个候选跑逐图分割 → 计算 IoU/分级/耗时 → 写逐图结果 +
 * 联系表 PNG + 报告 JSON/MD。损坏图/损坏模型走 catch，标 errored，绝不崩溃、绝不伪造。
 *
 * 用法：npx tsx scripts/segmentation-benchmark/runBenchmark.ts [--segmenter stub|onnx|all] [--tag NAME]
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { PNG } from 'pngjs';
import type { Manifest } from './generateFixtures';
import { grade, iou, pixelAccuracy, summarize, type Grade, type Summary } from './metrics';
import { decodePNG, rgbaToGray, type RGBA } from './pngUtil';
import { OnnxSegmenter, StubSegmenter, type Segmenter } from './segmenter';

const here = dirname(fileURLToPath(import.meta.url));
const PRIVATE = join(here, '.private');

export interface Args {
  segmenter: 'stub' | 'onnx' | 'all';
  tag: string;
}

export interface PerImageResult {
  id: string;
  segmenter: string;
  iou: number | null;
  pixelAccuracy: number | null;
  grade: Grade;
  ms: number | null;
  errored: boolean;
  error?: string;
}

export interface RunReport {
  tag: string;
  source: string;
  device: string;
  segmenters: Array<{
    name: string;
    available: boolean;
    unavailableReason?: string;
    modelBytes: number;
    modelHash: string;
    summary: Summary | null;
  }>;
  perImage: PerImageResult[];
  generatedAt: string;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { segmenter: 'stub', tag: 'run' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--segmenter') a.segmenter = argv[++i] as Args['segmenter'];
    if (argv[i] === '--tag') a.tag = argv[++i];
  }
  return a;
}

function safeDecode(path: string): RGBA {
  return decodePNG(readFileSync(path)); // 损坏 PNG 在此抛错
}

function sha256File(p: string): string {
  if (!existsSync(p)) return '';
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function thumb(src: RGBA, tw: number, th: number, tint?: [number, number, number]): Buffer {
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = Math.floor((x / tw) * src.width);
      const sy = Math.floor((y / th) * src.height);
      const si = (sy * src.width + sx) * 4;
      const di = (y * tw + x) * 4;
      if (tint) {
        const v = src.data[si];
        out[di] = tint[0];
        out[di + 1] = tint[1];
        out[di + 2] = tint[2];
        out[di + 3] = v;
      } else {
        out[di] = src.data[si];
        out[di + 1] = src.data[si + 1];
        out[di + 2] = src.data[si + 2];
        out[di + 3] = 255;
      }
    }
  }
  return out;
}

function buildContactSheet(rows: Array<{ image: RGBA; gt: RGBA; pred: RGBA | null }>): Buffer {
  const tw = 64;
  const th = 80;
  const cols = 3;
  const pad = 4;
  const W = cols * tw + (cols + 1) * pad;
  const H = rows.length * (th + pad) + pad;
  const canvas = new PNG({ width: W, height: H, fill: true });
  canvas.data.fill(255);
  const put = (buf: Buffer, ox: number, oy: number) => {
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const s = (y * tw + x) * 4;
        const d = ((oy + y) * W + (ox + x)) * 4;
        const a = buf[s + 3] / 255;
        canvas.data[d] = Math.round(buf[s] * a + 255 * (1 - a));
        canvas.data[d + 1] = Math.round(buf[s + 1] * a + 255 * (1 - a));
        canvas.data[d + 2] = Math.round(buf[s + 2] * a + 255 * (1 - a));
        canvas.data[d + 3] = 255;
      }
    }
  };
  rows.forEach((r, i) => {
    const oy = pad + i * (th + pad);
    put(thumb(r.image, tw, th), pad, oy);
    put(thumb(r.gt, tw, th, [120, 120, 120]), pad * 2 + tw, oy);
    if (r.pred) put(thumb(r.pred, tw, th, [40, 140, 80]), pad * 3 + tw * 2, oy);
  });
  return PNG.sync.write(canvas);
}

function predGrayToRgba(gray: Uint8Array): Buffer {
  const buf = Buffer.alloc(gray.length * 4);
  for (let i = 0; i < gray.length; i++) {
    buf[i * 4] = gray[i];
    buf[i * 4 + 1] = gray[i];
    buf[i * 4 + 2] = gray[i];
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

function renderMarkdown(r: RunReport): string {
  const lines: string[] = [];
  lines.push(`# 抠图基准报告 — ${r.tag}`);
  lines.push('');
  lines.push(
    `- source: **${r.source}**${r.source === 'synthetic' ? '（合成夹具；真实样本门槛不可据此判定，见 BLOCKED.md B-5）' : ''}`,
  );
  lines.push(`- device: ${r.device}`);
  lines.push(`- generatedAt: ${r.generatedAt}`);
  lines.push('');
  lines.push('| segmenter | available | total | usable | marginal | severe | usableRate | severeRate | p50 ms | p95 ms |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const s of r.segmenters) {
    if (!s.summary) {
      lines.push(`| ${s.name} | NO (${s.unavailableReason ?? ''}) | - | - | - | - | - | - | - | - |`);
      continue;
    }
    const sm = s.summary;
    const flag = sm.passesRealThreshold ? '' : ' ⚠ 未达真实样本门槛';
    lines.push(
      `| ${s.name} | yes | ${sm.total} | ${sm.usable} | ${sm.marginal} | ${sm.severe} | ${(sm.usableRate * 100).toFixed(1)}% | ${(sm.severeRate * 100).toFixed(1)}% | ${sm.p50Ms.toFixed(1)} | ${sm.p95Ms.toFixed(1)} |${flag}`,
    );
  }
  lines.push('');
  const errored = r.perImage.filter((p) => p.errored);
  lines.push(`## 异常样本（${errored.length}）`);
  for (const e of errored.slice(0, 30)) lines.push(`- ${e.id} / ${e.segmenter}: ${e.error ?? 'errored'}`);
  lines.push('');
  lines.push('## 仍需手修的边缘类型');
  lines.push('- 流苏/蕾丝等半透明细边（合成 hard 例 IoU 偏低）；真图到位后据 humanJudgement 复核。');
  return lines.join('\n');
}

export async function runBenchmarkAsync(args: Args): Promise<RunReport> {
  const manifest = JSON.parse(readFileSync(join(PRIVATE, 'manifest.json'), 'utf8')) as Manifest;
  const segmenters: Segmenter[] = [];
  if (args.segmenter === 'stub' || args.segmenter === 'all') segmenters.push(new StubSegmenter());
  if (args.segmenter === 'onnx' || args.segmenter === 'all') {
    const mp = join(PRIVATE, 'models', 'u2netp.onnx');
    segmenters.push(new OnnxSegmenter({ name: 'u2netp-onnx', modelPath: existsSync(mp) ? mp : undefined, modelHash: sha256File(mp) }));
  }

  const perImage: PerImageResult[] = [];
  const sheetRows: Array<{ image: RGBA; gt: RGBA; pred: RGBA | null }> = [];
  const gradesByName = new Map<string, Grade[]>();
  const latByName = new Map<string, number[]>();

  for (const entry of manifest.entries) {
    let image: RGBA;
    let gt: RGBA;
    try {
      image = safeDecode(join(PRIVATE, entry.image));
      gt = safeDecode(join(PRIVATE, entry.groundTruthAlpha));
    } catch (e) {
      const msg = String(e);
      for (const seg of segmenters) {
        perImage.push({ id: entry.id, segmenter: seg.name, iou: null, pixelAccuracy: null, grade: 'severe', ms: null, errored: true, error: msg });
        gradesByName.set(seg.name, [...(gradesByName.get(seg.name) ?? []), 'severe']);
      }
      sheetRows.push({ image: emptyRgba(), gt: emptyRgba(), pred: null });
      continue;
    }
    let predRgba: RGBA | null = null;
    for (const seg of segmenters) {
      if (!seg.available) {
        perImage.push({ id: entry.id, segmenter: seg.name, iou: null, pixelAccuracy: null, grade: 'severe', ms: null, errored: true, error: seg.unavailableReason });
        gradesByName.set(seg.name, [...(gradesByName.get(seg.name) ?? []), 'severe']);
        continue;
      }
      try {
        const res = await seg.segment(image);
        const pair = { gt: rgbaToGray(gt), pred: res.alpha };
        const g = grade(iou(pair), false);
        perImage.push({ id: entry.id, segmenter: seg.name, iou: iou(pair), pixelAccuracy: pixelAccuracy(pair), grade: g, ms: res.ms, errored: false });
        gradesByName.set(seg.name, [...(gradesByName.get(seg.name) ?? []), g]);
        latByName.set(seg.name, [...(latByName.get(seg.name) ?? []), res.ms]);
        if (predRgba === null) predRgba = { width: image.width, height: image.height, data: predGrayToRgba(res.alpha) };
      } catch (e) {
        perImage.push({ id: entry.id, segmenter: seg.name, iou: null, pixelAccuracy: null, grade: 'severe', ms: null, errored: true, error: String(e) });
        gradesByName.set(seg.name, [...(gradesByName.get(seg.name) ?? []), 'severe']);
      }
    }
    sheetRows.push({ image, gt, pred: predRgba });
  }

  const outDir = join(PRIVATE, 'results', args.tag);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'per_image.json'), JSON.stringify(perImage, null, 2));
  writeFileSync(join(outDir, 'contact_sheet.png'), buildContactSheet(sheetRows));

  const report: RunReport = {
    tag: args.tag,
    source: manifest.source,
    device: 'host (synthetic fixtures; on-device latency see MVP-002 probe)',
    segmenters: segmenters.map((seg) => ({
      name: seg.name,
      available: seg.available,
      unavailableReason: seg.unavailableReason,
      modelBytes: seg.modelBytes,
      modelHash: seg.modelHash,
      summary: seg.available ? summarize(gradesByName.get(seg.name) ?? [], latByName.get(seg.name) ?? []) : null,
    })),
    perImage,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, 'report.md'), renderMarkdown(report));
  return report;
}

function emptyRgba(): RGBA {
  return { width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await runBenchmarkAsync(args);
  // eslint-disable-next-line no-console
  console.log(`benchmark ${args.tag} done -> .private/results/${args.tag}/report.md`);
  // 注：合成夹具下不以 IoU 阈值卡红（stub 仅占位，真实门槛由真图+真模型决定，见 BLOCKED B-5）。
  // 红/绿判定统一由 validateReport.ts 执行；反向验证通过注入损坏样本驱动 validator 非零退出。
  const stub = report.segmenters.find((s) => s.name === 'stub-heuristic');
  if (stub?.summary) {
    // eslint-disable-next-line no-console
    console.log(
      `stub synthetic: usable=${(stub.summary.usableRate * 100).toFixed(0)}% severe=${(stub.summary.severeRate * 100).toFixed(0)}% (synthetic self-check only)`,
    );
  }
}

const isMain = process.argv[1]?.includes('runBenchmark');
if (isMain) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
}
