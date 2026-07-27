# MVP-002 验收证据清单

日期：2026-07-28  
状态：**BLOCKED（无真实照片）** —— 管线、清单格式、报告、反向验证、on-device 探针代码均已就绪；
真实样本「直接可用率≥80%/严重失败≤5%」门槛须真图，故卡片不得标最终验收（见 `BLOCKED.md` B-5）。

## 可复跑基准管线（host，tsx + pngjs）

- 清单格式：`scripts/segmentation-benchmark/.private/manifest.json`（schema 见 `generateFixtures.ts` Manifest；
  含 id/fg/bg/edge/contrast/image/groundTruthAlpha/humanJudgement/notes；真图替换 images+ground_truth 即复用）。
- 私有样本目录：`scripts/segmentation-benchmark/.private/`（gitignore，不入库；可复现生成）。
- 合成夹具：`pnpm bench:fixtures` 生成 17 张（白/黑/棋盘/复杂/阴影背景 × 实边/流苏/蕾丝 × 低对比硬例 + ground truth 精确蒙版）。
- 运行：`pnpm bench:run -- --segmenter stub --tag clean` → 逐图 `per_image.json` + 联系表 `contact_sheet.png` + `report.md/json`。
- 校验：`pnpm bench:validate -- --tag clean` → 样本数/结果数/缺失/透明通道/耗时/汇总一致；`OK` exit 0。
- 候选可插拔：`segmenter.ts` 的 `StubSegmenter`（Otsu+中心高斯连通域，占位）与 `OnnxSegmenter`
  （onnxruntime-node 适配；模型/运行时缺失即 available=false，**不伪造**）。

## 反向验证（红→绿）

- RED：注入损坏 PNG（`corrupt-001`）→ 运行 → `validate --tag corrupt` 报
  `RED: 1 errored per-image results` → **exit 3**。
- GREEN：`bench:fixtures` 重建干净清单 → 同 tag 运行 → `validate` **OK exit 0**。

## on-device 探针（onnxruntime-react-native，已集成）

- `apps/mobile/src/native/segmentationProbe.ts`：走文件路径/二进制（`InferenceSession.create(Uint8Array)`，
  图像像素经注入解码器，**不走 Base64 进模型**）；测 load/p50/p95/峰值内存/模型 sha256+体积；
  模型/图/运行时缺失返回 available=false+reason。
- 基准页 `apps/mobile/src/app/segmentation-benchmark.tsx`（deep link 可达，无模型即标 unavailable）。
- 待办：`expo prebuild` 链接 onnxruntime-react-native + 放入真实/转换 ONNX 模型 + 注入图像解码器后，
  在真机输出延迟；当前 APK 未链接该原生模块，探针在设备上为 unavailable（如实，非伪造）。

## 质量门

- `pnpm typecheck` exit 0；`pnpm test` 37/37/0；`pnpm lint` 0 errors。

## 结论与待真图项

- 默认/备用模型选择、下载/包内策略、设备降级条件：需真图基准数据后定（TECH_STACK §4 候选：
  U²-Net-p 低内存基线 / IS-Net 质量候选 / BiRefNet Lite 仅真机胜出后替换）。
- 仍需手修边缘类型（合成 hard 例已见）：流苏/蕾丝半透明细边。
