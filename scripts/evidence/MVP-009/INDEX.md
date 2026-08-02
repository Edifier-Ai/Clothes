# MVP-009 日历计划（PLN-01/02/03）证据索引

验收日期：2026-08-02。设备：OnePlus LE2120（10c1b57d，Android 14，Metro dev-client，adb reverse tcp:8081）。

## 质量门

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx jest --silent` | 56 suites / 400 passed / 0 failed |
| `npx expo lint` | 0 errors / 9 warnings（基线持平） |

## RED → GREEN

- `red-calendar-service.txt`：实现前 calendar/planService 模块不存在，exit=1。
- `green-calendar-service.txt`：calendar 13 用例 + planService 11 用例 + planView 7 用例全绿。
- `red-break-tombstone.txt`（反向验证）：同时去掉 expoDb/sqliteTestHelper 两处 `listActivePlans` 墓碑过滤 → 墓碑测试红（deletedAt 非空的行泄漏进活动列表，exit=1）；还原后全绿。

覆盖点：月历生成（2026-07-27 周一归位）、UTC 日期数学（DST 安全）、跨月 spillover、同日多时段、记录已穿幂等（completed/changed 再记录不改 completedAt）、快照展开与坏 JSON 容错、造型墓碑后 lookMissing、编辑 lookId 缺省保持/显式 null 改回临时组合、删除为墓碑且不动造型、镜像 v7 往返。

## 真机截图

| 文件 | 内容 |
|---|---|
| `pln-01-month-empty.png` | PLN-01 空态：周一开头、7/27–31 spillover 淡显、今天 8/2 oxblood 圆点、统计行、添加计划主操作 |
| `pln-03-form.png` | PLN-03 表单：日期步进+今天快捷键、时间段 chips+自定义、场合 chips、选择造型/临时组合、造型单选列表含真实封面 |
| `pln-01-month-two-plans.png` | 同日两项计划保存后：8/2 格两张缩略图（造型封面+单品缩略图），选中区「白天·通勤」「晚餐·晚餐」 |
| `pln-02-day-two-plans.png` | PLN-02 详情：两卡独立，造型卡含快照单品缩略图行，临时组合卡含两件单品图，记录已穿/有变化/编辑/删除齐 |
| `pln-02-one-worn.png` | 只记录晚餐一项已穿：已穿徽章、操作按钮消失；白天卡保持 planned |
| `pln-01-after-restart.png` | force-stop 冷启动后：日期无偏移、两计划与已穿状态完整、无重复记录 |
| `pln-01-tz-newyork.png` | 时区反向验证：系统切 America/New_York（设备 8/1 23:38 EDT）→「今天」移到 8/1 周六，8/2 计划字面量不动、缩略图原位 |
| `pln-01-tz-newyork-0802.png` | 纽约时区下选中 8/2：两计划+已穿完整，无「今天」误标 |
| `pln-01-tz-restored.png` | 恢复 Asia/Shanghai 后再冷启动：8/2 回到今天，全部状态无漂移 |
| `pln-mirror-plans.json` | 设备镜像 v7 `plans` 段：两条计划含 outfitJson 单品快照、status/completedAt 落持久镜像 |

## 结论

任务卡全部验收锚点通过：周一开头月历归位、跨月 spillover、同日工作/晚餐独立编辑且可只记录一项已穿、重启与时区往返无日期偏移/重复记录、记录已穿幂等（UI 已完成即无重复入口 + 服务层幂等测试）、快照保留+修复入口（lookMissing 测试 + PLN-02 修复按钮）、删除为墓碑不动造型（RED-BREAK 实锤）、保存失败保留表单（catch 只置错误不清表单）、月历缩略图来自真实造型/单品且缺图占位不破坏布局。

## 诚实限制

- 真机交互为 adb 点击驱动：PLN-03「保存失败保留表单」与「造型删除后修复入口」两支在设备上未实际注入故障/删造型演练，由 host 测试（savePlanCore 异常路径、lookMissing 用例）与代码路径（catch 不清表单）覆盖。
- 「有变化」内联输入在真机未逐字输入，host recordWornCore changed 分支有测试。
- 真机 timezone 切换用 `service call alarm 3`（ColorOS 禁 shell 写 secure settings），仅改时区未改时钟。
