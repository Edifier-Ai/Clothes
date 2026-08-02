# MVP-003 验收证据索引

最后更新：2026-08-01（真机复验完成）

## 当前结论

- 批量抠图队列、审核、手工修边在实体设备 `10c1b57d`（OnePlus LE2120 / Android 14，1080×2412）
  全链路复验通过：12 张连续导入、杀进程恢复、腾讯云真实抠图、Skia 修边、退出重进一致、
  原图零覆盖。本卡可标 `ACCEPTED`。
- 真机复验过程中发现并修复 4 个真实缺陷（见下），全部有 RED→GREEN 或设备红→绿证据。
- 真机运行环境：2026-08-01 Debug APK（含 Skia 2.10 + expo-secure-store）+ Metro dev-client。

## 复验发现并修复的缺陷

| # | 缺陷 | 证据（RED） | 修复 | 证据（GREEN） |
| --- | --- | --- | --- | --- |
| 1 | `enqueueBatch` 只插 garments 不插 garment_assets → 队列衣物详情「不存在」，且 pending/失败衣物原图只在 _staging | 真机详情页「衣物不存在或已删除」截图 + 设备 DB 查询（15 garments / 12 assets）；新增 `cutoutService.test.ts` 首跑红灯（asset undefined） | 入队即提交原图到 originals/ 并落 asset 行（sha256/bytes/mime），不覆盖既有原图 | 测试 2/2 绿；真机详情正常显示（`device-garment-detail-fixed.png`）；新批 12 件 assets 27/27 |
| 2 | 详情页无修边入口，cutout-editor 路由全工程无跳转（IMP-03/04 不可达） | 全仓 grep `cutout-editor` 无 router.push | 详情页 footer 加「修边」按钮（编辑态隐藏），`garment-detail.test.tsx` +2 | 测试 2/2 绿；真机详情页三按钮截图 |
| 3 | 修边页 Skia 双重故障：①lazy 回调内联 require + React Compiler → `ReferenceError: Property 'Rect' doesn't exist`；②Skia v2 `useImage` 对 file:// 原图真机空白 | 真机红屏截图（LogBox Render Error）与 Metro client_log；`device-imp03-editor-loaded.png`（白剪影无原图） | 画布拆为 `features/cutout/SkiaCanvas.tsx`（静态 import + React.lazy 动态 import）；原图改 `decodeSkImage` JSI 解码传入（skiaPngCodec +2 测试） | 真机原图+蒙版叠加渲染（`device-imp03-editor-with-original.png`） |
| 4 | 队列中断后无续跑入口：杀进程遗留 pending/running 时 UI 无任何可点按钮（「继续处理」仅限断网场景） | 代码走查 + 场景分析 | batch-import 挂载时凭证+同意齐全且有 pending/running → 自动续跑；「继续处理」按钮放开到任意 pending；react-compiler 声明顺序修复 | `batch-import.test.tsx` 13/13（含新增杀进程恢复/全完成不续跑 2 例）；真机杀进程恢复实录（下表） |

顺带小修：撤销后「操作 N」计数不刷新（undo 重建时同步 setInfo）；修边保存后透明预览/缩略图
用既有 `rebuildDerived` 按新蒙版重建（此前该函数无人调用）。

## 质量门（2026-08-01 终态）

- TypeScript：0 错误。
- Jest：24 suites / 182 passed / 0 skipped（本轮净增 +18：enqueueBatch 2、详情入口 2、decodeSkImage 2、batch-import 2、既有 174）。
- ESLint（expo lint）：0 errors / 9 warnings（≤ 既有基线）。
- RED→GREEN：enqueueBatch 缺 asset 测试先红后绿；此前本轮三处变异（引擎守卫/临时错误分支/consent）已有记录；本次设备级红→绿见上表 #1/#3。

## 真机队列证据（IMP-01/02）

| 验收点 | 文件/数据 | 说明 |
| --- | --- | --- |
| 配置+告知（前次会话） | `device-imp-config-form.png` / `device-imp-consent.png` | 凭证四字段表单（key 仅存本机）+ 上传告知 |
| 3 张首轮抠图（前次会话） | `device-imp-queue-succeeded.png` | 腾讯云真实 GoodsMatting，succeeded 3/3 |
| 12 张选图 | `device-picker-12-selected2.png` | 系统相册多选 12 项（/sdcard/Pictures/ClothesBatch，媒体扫描后置顶） |
| 队列处理中 | `device-dump/mirror-prekill.json` | succeeded 11 / running 1 / pending 3（12 新 + 3 旧） |
| **杀进程恢复** | 14:28 succeeded=11 时 `am force-stop` → 重启进批量导入 → 自动续跑截图 `device-imp02-recovery-resume.png`（pending 1 / running 1 / succeeded 13，状态「恢复中断的任务，继续处理中…」） |
| 恢复完成 | `device-imp02-recovery-done.png` + `device-dump/mirror-final.json` | succeeded 15/15，failed 0；**11 个杀进程前 succeeded 任务 updatedAt 全不变 = 已提交不重做** |
| 衣橱终态 | `device-wardrobe-27-final.png` | 27 件衣物（15 旧 + 12 新），新件 asset 行齐全（27/27） |
| 处理时间 | 设备 masks/ 目录 mtime | 12 张新任务首张 14:26 → 末张 14:29（含一次杀进程+重启）；单张约 8–15s（上传+GoodsMatting+下载+预览/缩略图生成） |
| 内存参考 | `dumpsys meminfo`（完成后静止态，非峰值采样） | TOTAL PSS ≈ 696 MB（含 Skia 解码图驻留；如实记录，未做峰值连续采样） |
| logcat | 无 FATAL EXCEPTION / AndroidRuntime / ReactNativeJS 错误 | 队列+修边全程 |

## 真机修边证据（IMP-03/04）

| 验收点 | 文件 | 说明 |
| --- | --- | --- |
| 审核页加载 | `device-imp03-editor-with-original.png` | 原图 + 蒙版红叠加（背景已抠除区红色，衣物保留），工具栏 11 控件，蒙版 256×320 |
| 擦除 | `device-imp04-erase-stroke.png` | 两笔擦除 → 操作 2，衣物上红印可见 |
| 撤销（边界） | `device-imp04-undo.png` / `device-imp04-undo2.png` | 逐笔回退至操作 0，蒙版还原（含计数刷新修复后复验） |
| 恢复 | `device-imp04-restore-stroke.png` | 恢复模式一笔 → 操作 1，红叠加被局部擦回 |
| 缩放/笔刷 | `device-imp04-zoom.png`（×0.75/笔 8） | ＋/−/复位/笔± 均生效 |
| 保存 | `device-imp04-saved.png` / `device-imp04-save-rebuild.png` | 「已保存蒙版（原图未动）」；previews/thumbnails 13:27→14:32 按新蒙版重建 |
| 退出重进一致 | `device-imp04-reentry-persist.png` / `device-imp04-session2-final.png` | 操作栈持久（操作 1→2），蒙版与叠加逐像素一致 |
| 原图零覆盖 | 原图 sha256 `0989b73fec95…` 修边前后一致（设备实测） | originals/ 只读 |
| 修边录屏 | `imp04-edit-session.mkv` | scrcpy 4.1 MKV（h264 1080×2412，ffprobe 校验可解码）；首段 MP4 因 kill 未写 moov 已废弃重录 |

## 诚实记录（未决/限制）

- 12 张连导用的设备测试照片多为非衣物图（风景/纹理/截图，历史测试遗留），验证的是队列/持久/恢复
  机制而非抠图质量；GoodsMatting 对非商品图也返回了蒙版。抠图质量门槛（≥80%/≤5%）属 MVP-002，
  仍 BLOCKED（B-8②，需用户 100–200 张目标场景照片）。
- 设备端「失败→重试/跳过」路径本轮未在真机注入（host 测试覆盖：队列状态机/重试预算/临时错误回 pending；
  引擎不可用保持 pending 有变异测试）。真机失败注入 = 杀进程（卡内列明的失败模式之一）。
- `_staging/` 暂存源图在处理成功后未清理（15 个文件残留）：不影响验收，磁盘卫生问题，建议后续任务顺带处理。
- 3 件前次会话遗留孤儿衣物（缺 asset 行）已用离线 SQL 补建行修复（sha256 按设备原图实算），
  镜像与 DB 已一致；修复脚本未入仓（一次性数据修复）。
