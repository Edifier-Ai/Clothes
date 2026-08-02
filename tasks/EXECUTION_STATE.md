# Clothes 长期执行状态

最后更新：2026-08-02
当前阶段：P0 全部完成
当前任务：无（MVP-014 ACCEPTED，P0 收官）
状态：MVP-014 ACCEPTED（Android P0 发布卡：Release APK v0.1.0 签名构建 + 真机安装闭环 + 飞行模式断网 + 升级迁移 + 反向验证 ROLLBACK + 模拟器响应矩阵 + 64 suites/483 tests/0 failed；见 `scripts/evidence/MVP-014/INDEX.md`）；MVP-002 待真图终判（B-8②，需用户 100–200 张目标场景照片）
方向决策：2026-07-31 用户拍板抠图改为现成分割 API（唯一路径），端侧 ONNX 作废；**默认引擎已选定腾讯云数据万象 GoodsMatting**（用户已配好账号）。AGENT_GOAL/TECH_STACK/MVP-002/MVP-003 已同步修订，详见 PROGRESS.md 决策记录与 BLOCKED.md B-8。

## 状态枚举

- `READY`：可以开始。
- `IN_PROGRESS`：唯一正在执行的任务卡。
- `BLOCKED`：存在需要外部输入的阻塞。
- `ACCEPTED`：验收证据完整。

## 当前任务

| 字段 | 内容 |
|---|---|
| 卡片 | 无（P0 全部 ACCEPTED） |
| 依赖 | MVP-000 至 MVP-011 + MVP-014（全部 ACCEPTED） |
| 已完成 | 2026-08-02 MVP-014 ACCEPTED：Release APK v0.1.0 签名构建（keystore.properties + releaseSigning + aapt 核对 com.clothes.app/0.1.0/versionCode=1）+ Debug 27 件闭环冒烟（恢复->推荐->记录->重启持久）+ Release 飞行模式断网（onboarding/4 tab 空状态/天气降级/重启持久）+ 升级安装迁移（adb install -r 保留 27 件 + schema v8 迁移）+ 反向验证（migrationRollback.test.ts 2 用例：v5 升级 v6 故障 ROLLBACK 保留数据 + 修复后升级成功 + 幂等）+ 模拟器响应矩阵 6 配置（360×800/390×844/430×932/1.3×字体/深色/TalkBack）+ 性能（300 件 5ms/冷启动 7.1s/PSS 545MB）+ 64 suites/483 tests/0 failed/lint 0 err/13 warn |
| 待办 | 无 P0 待办。P1 队列待激活（MVP-012/013/P1-001/P1-002） |

## MVP-014 验收结果（ACCEPTED -- 2026-08-02）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 64 suites / 483 passed / 0 failed（新增 migrationRollback.test.ts 2 用例） |
| `pnpm lint` | 0 errors / 13 warnings（无阻断） |
| Release APK 构建 | assembleRelease BUILD SUCCESSFUL，164 MB，aapt 核对 com.clothes.app/0.1.0/versionCode=1/targetSdk=36 |
| 签名 | release.keystore（RSA 2048，clothes-release 别名）+ keystore.properties + Gradle releaseSigning |
| 真机安装 Release | OnePlus 9 Pro 安装成功，冷启动显示 onboarding welcome |
| 闭环冒烟（Debug 27 件） | 恢复->推荐 4 槽+理由->就穿这套->完成记录->穿后洗护->重启新推荐（盘活不同衣物） |
| 飞行模式断网（Release） | onboarding 离线推进->today/衣橱/造型/计划 4 tab 空状态->天气降级"未使用天气"->重启持久 |
| 升级安装迁移 | adb install -r 覆盖安装->27 件完整保留->schema v8 迁移成功 |
| 反向验证 | migrationRollback.test.ts：v5 升级 v6 SQL 故障->ROLLBACK 保留 v5 数据（schema_version=5/garments 2 件/broken 表不存在）->修复后升级 v8 成功；幂等验证 |
| 模拟器响应矩阵 | 360×800/390×844/430×932/1.3×字体/深色/TalkBack 6 配置均正常显示 onboarding welcome，无裁切/乱码/崩溃 |
| 性能 | 300 件 build=5ms/filter=0ms/sort=0ms/search=0ms；冷启动 7155ms（Debug+Metro）；PSS 545MB |
| 杀进程/重启数据一致 | force-stop 冷启动后 27 件衣物 + onboarding 状态持久 + 推荐盘活不同衣物 |
| 无 P0 崩溃/数据丢失/原图覆盖 | logcat 无 FATAL EXCEPTION；原图永不被覆盖（addOriginalOnly） |
| 29 设计页对照 | INDEX.md 15 关键页对照表 + 未出图 59 页沿用 MVP-001..011 证据 |

证据：`scripts/evidence/MVP-014/INDEX.md`（真机截图 30+ 张 + 模拟器矩阵 6 张 + aapt 元数据 + 反向验证测试）

## MVP-011 验收结果（ACCEPTED -- 2026-08-02）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 63 suites / 481 passed / 0 failed（洞察：core 2 suite / 37 用例 + UI 外壳 1 suite / 6 用例 + 衣橱入口断言 1 用例） |
| `pnpm lint` | 0 errors / 9 warnings（基线持平） |
| 指标统一来自穿着事实 | wear_days distinct / 盘活≥1 次 / 重复率≥2 次/盘活 / 成本次=价÷次向下取整 / 久未穿 30-60-90（metrics.test.ts 23 用例 + insightsService.test.ts 14 用例） |
| 编辑/删除穿着记录后同步更新 | insightsService 实时算不写镜像，从 wear_logs/garments 装配；归档/墓碑/0 次/学习期边界全测 |
| 归档保留历史贡献但不进当前可穿 | STA-01「已归档 0」；归档 garment 计入 totalGarments/totalWears 但 activeGarments 排除；RED-BREAK-1 归档过滤实锤 |
| 久未穿 30/60/90 + 新录入未穿分开 | STA-02 四段显示；newUnworn=id=0 次，idle=穿过过但 days≥30 |
| 0 次无价不出现除零/NaN/虚假成本 | STA-03 显「未填价格」「穿 N 次」；computeCostPerWear 守卫 + RED-BREAK-2 0 次虚假计算实锤 |
| 脱敏分享产物不含受保护字段 | STA-04 分享预览无原图/价格/备注/定位；hasProtectedLeak 兜底校验 + 测试 |
| 学习期 | wearDays<7 显示「再连续记录几天，洞察会更准确」 |
| 时区安全 | date 字面量 YYYY-MM-DD 分组，不做 epoch 转换（与 plans/trips 同语义） |
| 重启持久 | force-stop 冷启动后 STA-01 KPI 零漂移（2 穿着天数·10 盘活·20% 重复率·27 总单品） |
| 持久化 | 沿用 schema v8（不改 schema）；镜像 v8 终态 garments 27/wearLogs 3/wearLogItems 12 与 UI 显示一致 |
| 反向验证 | RED-BREAK-1 归档过滤（2 测试红）+ RED-BREAK-2 0 次虚假成本（3 测试红）；双还原全绿 |

证据：`scripts/evidence/MVP-011/INDEX.md`（真机截图 8 张 + RED/GREEN 输出 + 镜像 v8 终态）

## MVP-010 验收结果（ACCEPTED —— 2026-08-02）

## MVP-010 验收结果（ACCEPTED —— 2026-08-02）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 61 suites / 461 passed / 0 failed（旅行三 suite 单独 3/35） |
| `pnpm lint` | 0 errors / 9 warnings（基线持平） |
| 旅行 CRUD | 保存目的地/日期范围/时区/活动/天气快照；墓碑删除；不存在容错（tripService 用例 + 镜像字段） |
| 每日多造型 | 同日白天+晚餐两套独立编辑；关联造型 vs 临时组合；occasion/note 可空（TRP-04 截图 + 用例） |
| 去重打包 | 同一衣物多套只一项 + sourceCount 累加 + sourceOutfitIds 可追溯；五天十套同一件鞋 → 一项 sourceCount=10（packingService 锚点用例 + TRP-05 截图） |
| 手工项目 | kind=manual 不被重新生成覆盖或删除；添加/删除独立（packingService 用例） |
| 勾选与衣物事实分离 | packing_items.checked 独立于 garments；重新生成保留仍存在项的勾选状态（用例 + TRP-05 勾选截图） |
| 删除造型重算 | 删除某日造型后 sourceCount 更新、不误删手工项（RED-BREAK sourceCount 实锤） |
| 复盘未穿依据 | 「未穿」只依据 wornStatus 不依据 checked（TripReview 用例 + TRP-06 截图） |
| 状态与失败恢复 | 天气不可用不阻塞（weatherSnapshotJson=null 仍保存）；lookMissing 标记 + 修复入口；重新生成/勾选幂等 |
| 重启持久 | force-stop 冷启动后旅行/安排/勾选状态零漂移（trp-restart-01..04 四张） |
| 持久化 | schema v8 四表 + 镜像 v8（设备镜像 trips/tripOutfits/packingItems/tripTemplates 四段，trp-mirror-v8-final.json） |
| 反向验证 | RED-BREAK：变异 computePackingFromOutfits sourceCount 累加 → 9 测试失败（含五天十套期望 10 实得 1）；还原全绿 |

证据：`scripts/evidence/MVP-010/INDEX.md`（真机截图 18 张 + RED/GREEN/RED-BREAK 输出 + 镜像 v8 终态）

## MVP-009 验收结果（ACCEPTED —— 2026-08-02）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 56 suites / 400 passed / 0 failed |
| `pnpm lint` | 0 errors / 9 warnings |
| 月历语义 | 周一开头 42 格、2026-07-27 周一归位、跨月 spillover；UTC 日期数学 DST 安全（calendar 13 用例） |
| 同日多时段 | 白天(通勤·关联造型)+晚餐(临时组合)各自独立编辑；只记录晚餐一项已穿，白天保持 planned（真机 pln-02） |
| 记录已穿幂等 | status 非 planned 再记录原样返回不改 completedAt（planService 用例）；UI 完成后无重复入口 |
| 快照与修复 | 保存时展开造型单品快照；造型墓碑后快照完整、lookMissing=true、PLN-02「重新选择造型」修复入口 |
| 编辑/移动/删除 | 删除为墓碑（列表消失行保留、不动造型）；lookId 缺省保持/显式 null 改回临时组合 |
| 重启/时区 | force-stop 冷启动无偏移；系统时区上海→纽约→上海往返，计划日期字面量与已穿状态零漂移（真机 3 张） |
| 持久化 | schema v7 plans 表 + 镜像 v7（设备镜像 plans 段含 outfitJson 快照，pln-mirror-plans.json） |
| 反向验证 | RED-BREAK：去两处 listActivePlans 墓碑过滤 → 墓碑行泄漏红灯（red-break-tombstone.txt）；还原全绿 |

证据：`scripts/evidence/MVP-009/INDEX.md`（真机截图 9 张 + RED/GREEN/RED-BREAK 输出 + 镜像 plans 段）

## MVP-008 验收结果（ACCEPTED —— 2026-08-02）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 53 suites / 368 passed / 0 skipped |
| `pnpm lint` | 0 errors / 9 warnings |
| 快速槽位 | 6 槽合法性校验、缺项提示实时更新（slots host 测试 + LOK-02 截图） |
| 自由画布 | 点选/拖动/双指缩放旋转/置底/撤销重做（redo 与操作态 md5 一致；20 连撤销重做 history host 覆盖） |
| 3:4 统一画布 | 编辑/封面合成（840×1120）/图库详情三处同比例，缓存封面 contain 不裁切（geometry +5 用例） |
| 编辑器↔封面同源 | displayImagePaths 双通道，画布与封面同用透明底预览（displayImage +3 用例） |
| 持久化重启一致 | 五件画布保存 → force-stop 重启 → 详情几何层级逐件一致（lok-r5-03/05b/06/07） |
| 克隆/变体 | 变体只换下装、source_look_id 关联保留、原造型未改（LOK-06 截图 + lookFactory host） |
| 反向验证 | 删派生封面 PNG → 冷启动由 look_items 事实实时重建，造型不丢；另有 host RED-BREAK zorder 去归一化红灯 |
| 响应矩阵 | 模拟器 360×800/390×844/430×932 + 1.3× 字体 12 张 lok-r6 截图，无裁切无溢出 |

证据：`scripts/evidence/MVP-008/INDEX.md`（真机 r3/r5 截图 + 手势录屏 + RED/GREEN 输出 + 模拟器矩阵）

## MVP-007 验收结果（ACCEPTED —— 2026-08-01）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 30 suites / 236 passed / 0 skipped |
| `pnpm lint` | 0 errors / 9 warnings |
| 搜索/组合筛选 | 类别+颜色+季节+场景+状态+久未穿+名称/品牌/备注，组合交集、归档排除、无结果保留条件（search.test 9 用例 + CLS-02 真机截图） |
| 详情真实统计 | 次数/最近/成本次（19900÷2=9950，无效显口径）/使用造型（stats.test 7 用例 + CLS-03 截图） |
| 状态机与历史 | clean/laundry/dryclean/loaned + archivedAt 正交；事件全带时间戳；相同状态不记；归档须先恢复（status.test 10 用例 + CLS-05/06 截图） |
| 批量事务 | 预校验+写入两阶段；写入期失败整体回滚（RED-BREAK-2 去事务 → g1 被改 laundry 红灯实锤；还原全绿） |
| 归档恢复 | 默认列表/推荐排除，恢复后 wear_logs/事件完整；归档区批量恢复真机截图 |
| 穿后联动 | TDY-07 逐件洗护、skip 不篡改、不存在即回滚；laundry/dryclean 经 isAvailable 立即排除出推荐 |
| 持久化 | schema v5 garment_status_events；镜像 v5 往返测试；真机 force-stop 重启历史 6 条完整（cls-06b） |
| 300 件性能 | build≈4–5ms / filter/sort/search≈0ms（阈值 500ms 未松动，perf-300.txt） |
| 反向验证 | RED-BREAK-1 断镜像回灌 → 事件丢失红灯；RED-BREAK-2 去事务 → 半数衣物被改红灯；双还原绿灯 |

证据：`scripts/evidence/MVP-007/INDEX.md`（真机截图 18 张 + RED/GREEN 输出 + 性能日志）

## MVP-002 结果（BLOCKED：GoodsMatting 已接通，样本量与真机终判未完成）

| 检查 | 结果 |
|---|---|
| 默认引擎 | 腾讯云数据万象 GoodsMatting；host 真实冒烟 `256×320 → 686ms`，上传、处理、下载、alpha 提取与 COS 删除通过 |
| App 接线 | SecureStore 凭证、上传告知/同意、可恢复队列、临时网络错误回 pending、原图兜底均已实现 |
| 公开样本 | 10 张已实跑，p50 1107ms / p95 1511ms；5 张目标电商图人工判定 4/5 可用，鞋类只抠单只为已知失败模式 |
| 自动报告限制 | 5 张电商图 ground truth 是全零占位、5 张 ModaNet 是人物穿搭标注，与“单件商品抠图”目标不一致，自动 0%/70% 不可作终判 |
| 真图门槛 | 任务卡要求 100–200 张目标场景样本和 Android 真机结果，当前均未完成，保持 BLOCKED |

证据：`scripts/evidence/MVP-002/INDEX.md`

## MVP-001 验收结果（ACCEPTED）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 7 suites / 37 passed / 0 skipped |
| `pnpm lint` | 0 errors |
| 添加→网格→详情→编辑 | 真机断网通过，截图齐 |
| 重启持久 | force-stop+重启 FinalEdited 仍在（镜像回灌） |
| RED→GREEN | 哨兵注入失败→UI 报错+无孤儿+无半条；移除→成功 |
| 持久方案 | expo-sqlite 会话引擎 + file-system 镜像（B-4 设备适配） |

证据目录：`scripts/evidence/MVP-001/INDEX.md`

## MVP-004 验收结果（ACCEPTED）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 11 suites / 69 passed / 0 skipped |
| `pnpm lint` | 0 errors / 17 warnings（可接受） |
| ONB-01..07 真机截图 | 齐（`scripts/evidence/MVP-004/onb-01..07-*.png`） |
| 12 件首套只含真实衣物 | 是（id `019fa67a-...` 真实录入；理由 `含真实上装+下装 / 含鞋 / 含外套`） |
| 配额进度 0→6→12 | 真机逐件更新（含连衣裙顶替逻辑） |
| 途中 force-stop 重启恢复 | quota 步骤恢复（`onb-05-restart-recovery.png`） |
| 二次启动直达今日页 | 是（`onb-07-restart-direct-today.png`，未走 onboarding） |
| 反向验证 | host 测试「12 件但无鞋 → missing=['shoes']，补鞋后 ok=true」覆盖 |
| 原图不覆盖 | `addOriginalOnly` 仅存原图+sha256，无蒙版写入 |
| 持久方案 | expo-sqlite meta 表 + 镜像 v2（B-4 兜底） |

## MVP-005 验收结果（ACCEPTED）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 12 suites / 88 passed / 0 skipped |
| `pnpm lint` | 0 errors / 17 warnings（可接受） |
| TDY-01/02/06 真机截图 | 齐（`scripts/evidence/MVP-005/tdy-01/02/06-*.png`） |
| 12 件合法衣橱可复现推荐 | 是（纯函数+确定性排序：久未穿→次数少→id 兜底） |
| reason_codes 可追溯 | 是（OCCASION_COMMUTE/FRESH_NEW/SLOT_FILLED_OUTER，仅来自真实命中规则） |
| 记录原子写 | wear_logs+wear_log_items 同事务；幂等（recommendation_id+date 唯一） |
| 不可用衣物排除 | laundry/dryclean/loaned/archived 不进候选（`isAvailable` 硬约束） |
| 反向验证 | RED：注释 isAvailable 过滤 → 2 测试失败；GREEN：恢复 → 88 全通过 |
| 持久化 | 镜像 v3 跨强杀恢复 recommendations+wear_logs；真机 force-stop 重启后推荐盘活不同衣物 |
| schema v3 | recommendations/recommendation_items/reason_codes/wear_logs/wear_log_items |

## MVP-003 验收结果（ACCEPTED —— 2026-08-01 真机复验完成）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 24 suites / 182 passed / 0 skipped |
| `pnpm lint` | 0 errors / 9 warnings |
| 12 连导+杀进程恢复 | succeeded 11/running 1/pending 3 时 force-stop → 重启自动续跑 → 15/15，已提交 11 件 updatedAt 零变化（不重做） |
| 腾讯云真实抠图 | 首轮 3/3 + 本轮 12/12，failed 0 |
| Skia 修边 | 擦除/撤销（至 0）/恢复/缩放/笔刷/保存全过；退出重进蒙版+操作栈一致；原图 sha256 修边前后不变；预览/缩略图按新蒙版重建 |
| 复验驱动修复 | enqueueBatch 漏 asset 行（RED→GREEN）、详情无修边入口（+2 测试）、Skia lazy-require Rect 报错+useImage file:// 空白（拆 SkiaCanvas 模块+decodeSkImage，+2 测试）、队列中断无续跑入口（挂载自动续跑+按钮放开，+2 测试） |
| 诚实限制 | 12 张测试照片多为非衣物图（队列机制验证，质量门槛归 MVP-002）；真机失败注入=杀进程；`_staging/` 成功后残留（非阻塞） |

证据：`scripts/evidence/MVP-003/INDEX.md`（真机截图 15 张 + MKV 修边录屏 + 设备 DB/镜像 dump）

## MVP-006 验收结果（ACCEPTED —— 2026-08-01 真机证据补齐）

| 检查 | 结果 |
|---|---|
| 替换/重算 | 真机：只换上装其余 ID 不变；换一套不重复、主角保留、跳过原因落库 |
| 模式与反馈 | 四模式真机应用「新鲜」生效；镜像含 replace/skip/mode 反馈事件 |
| 天气 | 真机：前台授权仅点击后弹出、拒绝可手选城市、上海实时温度参与推荐（外套槽消失） |
| 离线 | 飞行模式「使用缓存」+ 搭配不消失：截图 + 78.9s scrcpy 录屏 |
| 持久化 | 设备镜像 v3→v4 升级，含 12 件衣物、3 条反馈、1 条天气缓存 |
| 质量门 | typecheck0 / lint 0err / 105+ 测试全过（batch-import 测试移至 `apps/mobile/tests/` 后 11/11） |
| Android | 2026-08-01 prebuild + assembleDebug 成功（505 tasks，9m20s），APK 含 expo-secure-store，真机安装运行 |
| logcat | 无 FATAL EXCEPTION / AndroidRuntime / ReactNativeJS 错误 |

证据：`scripts/evidence/MVP-006/INDEX.md`（真机截图 12 张 + 离线录屏 + 解锁清单 8 项全 ✓）

## P0 顺序

`MVP-000(✓) -> 001(✓) -> 002(BLOCKED 真图) -> 003(✓) -> 004(✓) -> 005(✓) -> 006(✓) -> 007(✓) -> 008(✓) -> 009(✓) -> 010(✓) -> 011(✓) -> 014(✓)`（P0 全部完成；012/013 于 2026-08-02 用户决策降级 P1，见 ROADMAP）

不得跳过依赖。任务被外部输入阻塞时，可做与其无依赖且不会造成返工的文档、测试夹具或下一卡预研，但不能把下一卡标为 `IN_PROGRESS`。

## 最近命令与结果

- `pnpm install`（hoisted，lockfile 提交）exit 0
- 2026-08-02 本轮（MVP-010 收尾）：typecheck 0；61 suites / 461 passed / 0 failed；lint 0 errors / 9 warnings（基线持平）
- 2026-08-02 前轮（MVP-009）：typecheck 0；56 suites / 400 passed / 0 failed；lint 0 errors / 9 warnings
- `npx expo prebuild --platform android --no-install`：成功
- 2026-07-30 旧 Android `assembleDebug`：BUILD SUCCESSFUL，505 tasks；2026-08-01 当前副本未发现 APK，加入 expo-secure-store 后须重新 prebuild+构建
- 2026-08-02 模拟器矩阵：sdkmanager 重装 android-35 google_apis x86_64；AVD Clothes2_360x800/390x844/430x932 可用（wm size/density 实测符合）；种子包 `C:/Users/Admin/AppData/Local/Temp/clothes-seed/seed.tar`（55M，40 衣物资产，run-as 注入 files/clothes 后 DB 空自动镜像恢复）；注意 Temp 目录可能被系统清理，必要时从真机重拉
- MVP-006 模拟器：TDY-03/04/05/08 与离线缓存降级通过；真机待 B-7 解锁

## 恢复点

1. 读取 `PROGRESS.md`。
2. 读取本文件确认当前卡（MVP-014 待激活）。
3. 读取当前卡的验收与非目标。
4. 检查工作树，保留未知改动。
5. 2026-08-02 MVP-010 ACCEPTED：schema v8 trips/trip_outfits/packing_items/trip_templates（当地日期字面量、outfitJson 快照、墓碑、无外键、勾选状态与衣物事实分离 packing_items.checked 独立于 garments）+ 镜像 v8（四表随 GarmentDump 进 dumpExtra/restoreExtra，兼容读 v1–v7）；core/trip 三模块（packView 纯函数 + tripService + packingService，仿 planService 可注入 Core + 设备单例 + writeMirror）；TRP-01..06 六屏 + 6 路由（`/trip`、`/trip-edit`、`/trip/[id]`、`/trip-day`、`/trip-packing/[tripId]`、`/trip-review/[tripId]`）+ PlanScreen 旅行入口；`src/app/` 测试禁放约定仍有效，TripScreens.test.tsx 外壳测试 mock 了 tripService/packingService 单例；RED-BREAK 变异 sourceCount 累加 → 9 测试失败；真机 TRP-01..06 + force-stop 重启持久 + 镜像 v8 终态四表完整。
6. 2026-08-02 MVP-009 ACCEPTED：schema v7 plans（date 当地日期字面量、outfitJson 快照、墓碑、无外键）+ 镜像 v7；calendar/planService/planView 纯函数+可注入 Core；PLN-01/02/03 三屏 + `plan/[date]`、`plan-edit` 路由；PlanScreen 场合标签中文映射为复验补的缺陷修复；OtherTabsScreen 外壳测试 mock 了 planService 单例；真机改时区用 `service call alarm 3 s16 "<IANA>"`（ColorOS 禁 shell 写 secure settings）。
7. 2026-08-01 已完成：ADB 授权恢复；prebuild+assembleDebug 新 APK（含 expo-secure-store）装真机；MVP-006 真机证据补齐并 ACCEPTED；`src/app/` 路由目录不再放测试文件（batch-import.test.tsx 已移至 `apps/mobile/tests/`）；MVP-003 真机复验 ACCEPTED（4 缺陷修复：enqueueBatch 漏 asset 行/详情无修边入口/Skia lazy-require+useImage 双故障/队列中断无续跑入口；设备 adb reverse tcp:8081 需在重启 App 前确认）。
8. 2026-08-01 MVP-007 ACCEPTED：实现为上一会话产出、本轮核对验收；新增 2 测试（镜像状态事件往返、批量写入期回滚）+ RED-BREAK 双反向验证（`red-break-1/2-*.txt`）；真机补拍 CLS-05/06/06b（杀进程后状态历史完整）。取证辅助 `scripts/evidence/MVP-007/ui.sh`；设备息屏先 `KEYCODE_WAKEUP`，勿用 keyevent 82（触发 Dev Menu）。
9. 2026-08-02 MVP-008 ACCEPTED：UI/领域层为上轮产出、本轮核对验收；复验驱动 2 静默缺陷修复（3:4 统一画布 CANVAS_ASPECT/fitCanvasBox、displayImagePaths 双通道同源）均 RED→GREEN；真机 r5 终验（五件画布重启一致、删封面冷启动重建）+ 模拟器响应矩阵 12 张 lok-r6。模拟器种子注入要点：adb push 本地路径用 Windows 形式、先 mkdir files/clothes、MSYS2_ARG_CONV_EXCL="*" 防路径转换；font_scale 变更会 recreate Activity 重现未完成的首套搭配向导（点「进入今日」即可）。
10. MVP-002 终判仍需用户拍摄 100–200 张目标场景衣物照片（B-8②，外部输入）。
11. 2026-08-02 MVP-011 领域层预研就绪（并行于 MVP-010，未激活任务卡）：`src/core/insights/metrics.ts` 5 纯函数 + `metrics.test.ts` 23 用例全绿，RED-BREAK 归档过滤反向验证通过；不碰 schema/镜像/UI/路由，等激活后接 db 适配层 + STA-01..04 UI。详见 PROGRESS.md。
12. 2026-08-02 用户决策：MVP-012/013 降级 P1（不急实现）。P0 收官依赖改为 000-011+014；AGENT_GOAL 完成条件去掉「导出恢复」硬闭环（断网闭环止于「重启仍存在」）。风险：P0 阶段无导出恢复/本地删除（触碰 AGENTS.md 数据安全/隐私精神，用户承担）。012/013 验收标准完整保留，回升 P0 无需重写。详见 PROGRESS.md。
13. 2026-08-02 MVP-011 ACCEPTED：从上轮领域层预研（metrics.ts 5 纯函数 + 23 用例）续接 db 适配层 `insightsService.ts`（双 db 模式 `db: GarmentDb` + `statsDb: AnyDb`，assembleFacts 过滤墓碑 items，设备单例不写镜像实时算，schema 沿用 v8 未改）+ STA-01..04 四屏 UI（InsightsScreen/IdleGarmentsScreen/CostPerWearScreen/MonthlyReportScreen）+ insightsView 格式化 + 4 路由（`/insights`、`/insights-idle`、`/insights-cost`、`/insights-monthly`）+ WardrobeScreen「洞察」入口 + 外壳测试 6 用例 + insightsService.test 14 用例；质量门 63 suites/481 passed/0 failed、lint 0 err/9 warn；RED-BREAK-1 归档过滤（2 测试红）+ RED-BREAK-2 0 次虚假成本（3 测试红）；真机 STA-01..04 + force-stop 重启持久零漂移 + 镜像 v8 终态 garments 27/wearLogs 3/wearLogItems 12。下一卡 MVP-014（Android P0 发布）。

## P1 队列

- `MVP-012-shopping-guard.md`（原 P0，2026-08-02 降级）
- `MVP-013-privacy-export-restore.md`（原 P0，2026-08-02 降级；含本地删除/导出恢复）
- `P1-001-managed-sync.md`
- `P1-002-ios-release.md`

只有 P0 Android 发布卡（MVP-014）验收后才允许激活 P1。
