#!/bin/bash
# MVP-008 响应矩阵：向模拟器注入造型种子数据（镜像 + 预览 + 缩略图 + 封面）
# 用法：seed-emu.sh <serial>   例：seed-emu.sh emulator-5554
set -e
export PATH="$PATH:/c/Users/Admin/AppData/Local/Android/Sdk/platform-tools"
S="$1"
SEED=/c/Users/Admin/AppData/Local/Temp/clothes-seed/seed.tar
APK=D:/Projects/Clothes/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk

adb -s "$S" wait-for-device
until [ "$(adb -s "$S" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done
echo "[$S] booted"
adb -s "$S" install -r "$APK" >/dev/null && echo "[$S] apk installed"
adb -s "$S" shell pm clear com.clothes.app >/dev/null
adb -s "$S" shell run-as com.clothes.app mkdir -p files/clothes
adb -s "$S" shell run-as com.clothes.app sh -c "'cat > files/clothes/seed.tar'" < "$SEED"
adb -s "$S" shell run-as com.clothes.app tar xf files/clothes/seed.tar -C files/clothes
adb -s "$S" shell run-as com.clothes.app rm files/clothes/seed.tar
adb -s "$S" shell run-as com.clothes.app ls files/clothes/ | tr -d '\r'
echo "[$S] seed injected"
