# MVP-008 证据索引：用快速槽位和自由画布创建真实造型

设备：OnePlus LE2120（10c1b57d，Android 14，1080×2412 = 360×804dp）+ AOSP 模拟器响应矩阵。
真机证据分三轮：r3（复验既有实现，发现 2 个静默缺陷）、r4（3:4 画布修复后）、r5（编辑器↔封面同源修复后终验）。

## 质量门（终态 2026-08-02）

- `pnpm typecheck` exit 0；Jest 53 suites / 368 passed / 0 skipped；expo lint 0 errors / 9 warnings（≤ 既有）。
- 记录：`green-canvas-aspect.txt`、`green-display-image.txt`。

## 复验驱动的 2 个真实缺陷修复（均 RED→GREEN）

1. **画布比例裁切**：编辑画布为 flex 竖屏（≈0.76），封面 PNG 正方形（840×840），
   归一化几何跨比例渲染导致详情/图库裁掉顶部与边缘内容（r3 详情截图 lok-r3-23c 实证）。
   修复：`geometry.ts` 新增 `CANVAS_ASPECT=3/4` + `fitCanvasBox`，编辑画布/封面合成
   （840×1120）/图库与详情渲染三处统一 3:4 规范画布，缓存封面 `contentFit=contain` 永不裁切。
   RED `red-canvas-aspect.txt`（5 失败）→ GREEN 11/11。
2. **编辑器↔封面图源不一致**：画布/槽位卡用 96×96 方形压缩缩略图（挤压宽高比、含背景），
   封面用透明底预览（真实宽高比）——所见≠所得，几何层级视觉不一致。
   修复：`displayImagePaths` 双通道（thumb 缩略图优先 / preview 预览优先与 rebuildCoverSpec 同源），
   选衣候选 `imageRelPath`=预览通道（画布/槽位卡/合成），`thumbnailRelPath`=缩略图通道（列表图标）。
   RED `red-display-image.txt`（3 失败）→ GREEN 3/3。

## LOK-01 ~ LOK-07 真机截图（r3/r5 终态）

| 页面 | 截图 | 要点 |
|---|---|---|
| LOK-01 造型图库 | `lok-r3-01-grid.png` / `lok-r5-06-grid-after-restart.png` | 封面真实合成、模式+件数、空态另有 lok-01-empty.png |
| LOK-02 快速槽位 | `lok-r3-03-slots-empty.png` / `lok-r3-06-slots-filled.png` | 6 槽、缺项提示「还缺：上装、下装、鞋」实时更新 |
| LOK-03 自由画布（重点） | `lok-r5-01/02/03` + `lok-r4-01-canvas-fitted.png` | 3:4 画布、点选、拖动、层级工具栏、撤销/重做 |
| LOK-04 选衣 | `lok-r3-04-picker.png` / `lok-r3-12-picker-canvas.png` | 搜索/分类 chips/只看可用/已选 ✓；上轮面板裁切缺陷已修复 |
| LOK-05 详情 | `lok-r3-07-slots-detail.png` / `lok-r5-07-detail-after-restart.png` | 大图封面、单品清单、克隆/变体/删除 |
| LOK-06 变体 | `lok-r3-08-variant-picker.png` / `lok-r3-09-variant-saved.png` | 只换下装 4→3，「基于 R3Slots」关联保留，原造型未改（`lok-r3-10` 复核下装 4 仍在） |
| LOK-07 主角单品创建 | `lok-07-directions.png` / `lok-07-saved.png`（r1） | 方向推荐生成造型 |

## 手势与交互

- `lok-03-gestures.mkv`（239.8s，h264 1080×2412，ffprobe 校验有效）：点选/拖动/双指缩放/旋转录屏（r1 录制；
  手势链路代码本轮未变，本机画布宽受限 left=0 触控几何不变）。本机 ffmpeg 不支持 ycgco 抽帧（同 MVP-006 限制），终态由截图交叉印证。
- 拖动：`lok-r5-01→02` 四连拖散开 5 件；层级：`lok-r3-16→17` 置底生效；
  撤销/重做：`lok-r3-18/19`（redo 与置底态 md5 完全一致 `8fe9e922…`）；20 连撤销/重做由 history.test host 覆盖。
- 双指不误触底栏：触控盒限制在画布内（hitTarget.min 下限），r1 录屏可见。

## 持久化与重启一致性（验收：五件画布保存→重启→重开几何层级一致）

- `lok-r5-03`（编辑态，5 件定位完成）→ 保存 → `lok-r5-05b`（详情，布局一致）→
  force-stop 重启 → `lok-r5-06`（图库封面正常）→ `lok-r5-07`（详情与保存前逐件一致：
  绿/蓝横条置顶区、苔藓左下、粉衣压体育馆右腿、层级不变）。

## 反向验证（删除派生封面 → 事实重建，造型不丢）

- 删除 `covers/019fc03a-….png`（R5Canvas5 派生封面，设备上 rm）；
  热态 `lok-r5-08/09` 后**冷启动**（force-stop 清内存缓存）`lok-r5-10/11`：
  图库与详情仍由 look_items 事实数据实时合成同一封面，单品清单 5 件完整，造型数据零丢失。
- 另有 host 级 RED-BREAK：`red-break-zorder.txt`（zorder 去归一化 → 1 失败，还原全绿）。
- 说明：cover_rel_path 已设置但文件被删时走实时合成兜底（不自动重写静态 PNG）；
  cover_rel_path 为空时详情页后台 rebuildCover 重建静态封面。静态 PNG 从不是唯一事实。

## 响应矩阵（模拟器 AOSP，真机 wm size 被 ColorOS 禁，同 MVP-000 先例）

- 真机原生 1080×2412@480 = 360×804dp 覆盖 360×800 档（本目录全部真机截图）。
- 2026-08-02 模拟器取证（android-35 google_apis x86_64 重装镜像，AVD Clothes2_*，种子镜像恢复 6 造型）：

| 档位（wm size/density 实测） | 截图 | 结果 |
|---|---|---|
| 360×800（1080×2400@480） | `lok-r6-360x800-grid/detail.png` | 图库封面 3:4、详情画布不裁切、几何层级与真机一致 |
| 390×844（1170×2532@480） | `lok-r6-390x844-grid/detail.png` | 同上 |
| 430×932（1290×2796@480） | `lok-r6-430x932-grid/detail.png` | 同上，单品清单 5 件完整可见 |
| 1.3× 字体 × 三档 | `lok-r6-*-font130-grid/detail.png`（6 张） | 标题/清单/按钮无截断无溢出，底部操作栏不遮挡 |

- 附注：font_scale 变更触发 Activity recreate，未完成的「首套搭配」向导页会重现（布局在 1.3× 下亦正常），
  点「进入今日」即回主流程——是 onboarding 幂等性表现，非缺陷。

## 诚实限制

- 12 件测试衣物多为非衣物测试图（抠图质量终判归 MVP-002，仍 BLOCKED）。
- 画布允许同一件衣物重复添加（拼贴语义未禁止）；「已选 ✓」仅标记不拦截——记录为产品观察，非验收项。
- 详情页大图首进有秒级解码占位（大图 base64 解码），随后渲染正常。
- 模拟器矩阵取证完成（2026-08-02，12 张 lok-r6 截图）；种子镜像（55M tar，40 衣物资产）可复用于后续卡片模拟器取证。

## 上轮（r1/r2）历史证据

- r1：`lok-01..07-*`、`picker-state*.png`、`boot-stuck.png`、`canvas-wait.png`、`red-break-zorder.txt`、
  `cover-rebuild-terminal.txt`（当时封面重建失败现场）、`logcat-check.txt`（无 FATAL/RN 错误）。
- r2：`mvp008-r2-boot.png`、`mvp008-new-menu.png`（封面图库恢复渲染）。
