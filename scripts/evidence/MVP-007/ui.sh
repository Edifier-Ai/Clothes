#!/bin/bash
# MVP-007 真机 UI 辅助：tap 文本 / 截图 / 键入（剪贴板方式输入中文）
export PATH="$PATH:/c/Users/Admin/AppData/Local/Android/Sdk/platform-tools"
export MSYS2_ARG_CONV_EXCL="*"
EV=scripts/evidence/MVP-007

shot() { adb exec-out screencap -p > "$EV/$1.png" && echo "shot $1"; }

# 打印当前界面全部文本节点（text 或 content-desc 非空）
texts() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null
  adb exec-out cat /sdcard/ui.xml | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const re=/text=\"([^\"]*)\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"/g;let m;
  while((m=re.exec(s))){ if(m[1]) console.log(m[1], '->', m[2],m[3],m[4],m[5]); }
});"
}

# tapt TEXT [nth]：点击第 nth 个（默认 1）完全匹配文本的节点中心
tapt() {
  local target="$1" nth="${2:-1}"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null
  local xy=$(adb exec-out cat /sdcard/ui.xml | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const target=process.argv[1], nth=parseInt(process.argv[2]);
  const re=/<node[^>]*text=\"([^\"]*)\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"[^>]*\/?>/g;let m,c=0;
  while((m=re.exec(s))){ if(m[1]===target){ c++; if(c===nth){ console.log((+m[2]+ +m[4])/2, (+m[3]+ +m[5])/2); return; } } }
  console.error('NOT FOUND: '+target); process.exit(1);
});" "$target" "$nth") || return 1
  adb shell input tap $xy && echo "tapped '$target' @ $xy"
}

# tapc X Y：坐标点击；swiped：向下滚动
tapc() { adb shell input tap $1 $2; }
swiped() { adb shell input swipe 540 1800 540 800 400; sleep 1; }
