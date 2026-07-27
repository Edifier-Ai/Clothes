#!/usr/bin/env bash
# 环境核对脚本：打印工具版本、设计资产数量与设备状态。
# 任一项失败以非零退出码结束，供任务卡验收复跑。
set -u

FAIL=0
note() { printf '%s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*"; FAIL=1; }

JAVA_HOME_GUESS="/c/Users/Admin/tools/jdk-17.0.19+10"
SDK_GUESS="/c/Users/Admin/AppData/Local/Android/Sdk"

note "== Clothes env-check =="

command -v git >/dev/null && note "git: $(git --version)" || fail "git missing"
command -v node >/dev/null && note "node: $(node --version)" || fail "node missing"
command -v pnpm >/dev/null && note "pnpm: $(pnpm --version)" || fail "pnpm missing"

JAVA_BIN="${JAVA_HOME:-$JAVA_HOME_GUESS}/bin/java"
if [ -x "$JAVA_BIN" ] || [ -f "$JAVA_BIN.exe" ]; then
  note "java: $("$JAVA_BIN" -version 2>&1 | head -1)"
else
  fail "java not found at $JAVA_BIN (set JAVA_HOME)"
fi

ADB="$SDK_GUESS/platform-tools/adb.exe"
if [ -f "$ADB" ]; then
  note "adb: $($ADB version | head -1)"
  note "devices:"
  "$ADB" devices | tail -n +2
else
  fail "adb not found at $ADB"
fi

TOTAL_PNG=$(find design -name '*.png' | wc -l)
CORE_PNG=$(find design/screens/direction-3-quiet-luxury -name '*.png' | wc -l)
note "design PNG total: $TOTAL_PNG (expect 35)"
note "core screens dir PNG: $CORE_PNG (expect 31 = 29 pages + 2 overviews)"
[ "$TOTAL_PNG" -eq 35 ] || fail "design PNG total != 35"
[ "$CORE_PNG" -eq 31 ] || fail "core screens PNG != 31"

TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)
note "git toplevel: $TOPLEVEL"
case "$TOPLEVEL" in
  *Projects/Clothes) note "git boundary: independent repo OK" ;;
  *) fail "git toplevel is not the Clothes directory" ;;
esac

if [ "$FAIL" -ne 0 ]; then
  note "== env-check: FAIL =="
  exit 1
fi
note "== env-check: OK =="
