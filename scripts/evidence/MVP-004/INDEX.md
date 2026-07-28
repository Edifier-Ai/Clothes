# MVP-004 证据索引

任务卡：`tasks/backlog/MVP-004-onboarding-activation.md`
验收日期：2026-07-28
设备：10c1b57d（OnePlus LE2120 / Android 14 / arm64 / 1080×2412@480dpi）

## 质量门

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm --filter @clothes/mobile test` | 11 suites / 69 passed / 0 skipped |
| `pnpm lint` | 0 errors / 17 warnings（可接受） |

## 真机截图（ONB-01..07 + 配额 + 重启 + 完成）

| 截图 | 节点 |
|---|---|
| `onb-01-welcome.png` | ONB-01 欢迎 |
| `onb-02-value.png` | ONB-02 三步价值 |
| `onb-03-privacy.png` | ONB-03 本地隐私 |
| `onb-04-goals.png` | ONB-04 目标选择 |
| `onb-05-quota.png` | ONB-05 启动配额（0/12 起始） |
| `image-picker.png` | ONB-05 图像选择器打开 |
| `after-pick-1.png` | 添加第 1 件后配额 1/12（上装 1/3） |
| `onb-05-after-2.png` | 添加第 2 件后配额 2/12（下装 1/3） |
| `onb-05-quota-6.png` | 6 件预览触发前 |
| `onb-06-preview.png` | ONB-06 6 件预览（首套可组） |
| `onb-05-quota-12.png` | 12 件配额完成 |
| `onb-07-reveal.png` | ONB-07 首套搭配（上装+下装+鞋+外套） |
| `onb-07-after-finish.png` | 完成跳转今日页 |
| `onb-07-restart-direct-today.png` | 二次启动直达今日页 |
| `onb-05-restart-recovery.png` | 途中 force-stop 重启恢复 quota |
| `wardrobe-12-items.png` | 衣橱页显示 12 件衣物 |
| `debug-state.png` | 调试用中间状态 |

## 关键观察

- **配额进度**：0→1→2→3→4→5→6（预览触发）→11→12（首套触发）逐件更新；
  配额顶替逻辑与 host 测试 `quotaStatus` 一致。
- **首套搭配**：12 件首套含真实录入衣物（id `019fa67a-...` 系列），
  理由 `含真实上装+下装 / 含鞋 / 含外套` 与 `buildFirstOutfit.reasons` 一致。
- **状态机**：`computeStep` 0/5/6/11/12 件边界正确切换 quota/preview/reveal/done。
- **首启分流**：`_layout.tsx` 用 `Redirect href="/onboarding"` + `SplashScreen`，
  completed=true 时跳过 onboarding 直达 (tabs)。
- **重启恢复**：途中 force-stop 重启恢复到 quota 步骤（meta 表持久）；
  完成后 force-stop 重启直达今日页。
- **原图不覆盖**：`addOriginalOnly` 仅存原图+sha256，无蒙版写入（cutout 阻塞下仍可录入 12 件）。

## 反向验证

- host 测试 `apps/mobile/src/core/onboarding/index.test.ts`：
  - 「12 件但无鞋（反向验证）→ ok=false missing=['shoes']，补鞋后 ok=true」覆盖"不伪造完整搭配且提示补鞋"。
  - 「无鞋 → ok=false missing 含 shoes（不伪造）」覆盖基础反向。
  - `parseOnboardState` null/坏 JSON/非法 step 容错覆盖。
  - `save→load` 还原 step/goals 覆盖持久化。

## 已知边界

- 抠图/修边设备验收仍 B-6 阻塞（Skia v2.10 在 SDK57 不 autolink + pngjs 需 Node builtins）；
  onboarding 用 `addOriginalOnly` 录原图无蒙版绕过阻塞，12 件录入闭环可设备验证。
- B-4（expo-sqlite 本机不 fsync）由镜像 v2 兜底；onboarding 状态用 meta 表 + 镜像双写。
