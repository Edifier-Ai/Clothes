# MVP-002 验收证据索引

最后更新：2026-08-01
状态：**BLOCKED** —— 腾讯云 GoodsMatting 的 host 真实链路、适配层与 App 接线已完成；任务卡要求的 100–200 张目标场景样本和 Android 真机终判仍未完成。

## 现役实现

- 基准适配器：`scripts/segmentation-benchmark/tencentCi.ts`，执行上传时处理、下载透明 PNG、alpha 提取与 COS 源/结果对象尽力删除。
- App 引擎：`apps/mobile/src/native/tencentCiEngine.ts`；凭证来自 expo-secure-store，上传前需明确同意，缺配置或拒绝时允许仅保存原图。
- 队列恢复：临时网络错误回到 pending，不消耗完重试次数；失败项可重新入队。
- 旧 ONNX/on-device 探针与 benchmark 页面已删除，不再是现役路径。

## 已验证

- 真实链路冒烟（`scripts/segmentation-benchmark/smokeTencentCi.ts`）：`256×320 → e2e 686ms`，签名、上传、Pic-Operations、XML 解析、下载、alpha 提取和 COS 删除均通过。
- 公开样本 10 张：p50 1107ms / p95 1511ms，均低于 8 秒目标。
- 目标场景电商图 5 张人工判定：dress、longsleeve、pants、t-shirt 4/5 可直接使用；shoes 只抠出单只，为当前明确失败模式。
- 另外 5 张 ModaNet 街拍会抠出完整人物，说明街拍穿着照不属于当前商品抠图目标场景。
- 反向验证覆盖签名 method 大小写与 alpha 通道偏移；三处变异均触发测试失败，恢复后通过。
- 2026-08-01 当前质量门：TypeScript exit 0；21 suites / 164 passed / 0 skipped；ESLint 0 errors / 14 warnings。

## 自动报告限制

`.private/results/public-10/report.*` 的自动汇总显示 0% usable / 70% severe，但不能用作产品终判：5 张电商图的 ground truth 是全零占位，5 张 ModaNet 的标注是人物身上的服装多边形，而 GoodsMatting 输出的是商品或完整人物轮廓。现阶段以人工判定作为探索证据，不把它升级为验收通过。

## 解锁条件

1. 按任务卡补足 100–200 张目标场景照片，覆盖黑白衣物、蕾丝/流苏、鞋包、衣架、阴影和复杂背景，并记录来源。
2. 用同一清单复跑 GoodsMatting，校验逐图结果、联系表、人工判定、错误与额度消耗。
3. 在已授权的物理 Android 上跑真实上传、抠图、修边、强杀恢复和连续 12 张队列。
4. 只有直接可用率 ≥80%、严重失败率 ≤5%、单张硬上限 15 秒且连续 12 张无静默失败，才把 MVP-002 标为 `ACCEPTED`。
