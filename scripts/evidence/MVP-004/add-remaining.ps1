$ADB = "C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe"
$S = "10c1b57d"
$EVID = "C:/Users/Admin/Desktop/Projects/Clothes/scripts/evidence/MVP-004"

# 点"继续补到 12 件"回到 quota
& $ADB -s $S shell input tap 540 906
Start-Sleep -Seconds 2

function Add-One([int]$catX, [int]$catY, [string]$label) {
  & $ADB -s $S shell input tap $catX $catY
  Start-Sleep -Milliseconds 400
  & $ADB -s $S shell input tap 540 1194
  Start-Sleep -Seconds 2
  & $ADB -s $S shell input tap 134 1882
  Start-Sleep -Seconds 3
  & $ADB -s $S shell uiautomator dump /sdcard/ui.xml 2>&1 | Out-Null
  $ctx = & $ADB -s $S shell cat /sdcard/ui.xml
  $m = [regex]::Match($ctx, 'text="启动包进度 (\d+)/12"')
  if ($m.Success) { Write-Host "[$label] $($m.Groups[1].Value)/12" } else { Write-Host "[$label] NO_PROGRESS (maybe reveal)" }
}

# 已 6 件: 2 top + 2 bottom + 1 shoes + 1 outer + 0 free
# 还需 6 件: 上装, 鞋, 外套, 自由, 自由, 上装(extra)
Add-One 235 816 "上装#3"
Add-One 214 972 "鞋#2"
Add-One 399 972 "外套#2"
Add-One 605 972 "自由#1"
Add-One 605 972 "自由#2"
Add-One 235 816 "上装#4(extra)"

& $ADB -s $S exec-out screencap -p > "$EVID/onb-05-quota-12.png"
& $ADB -s $S shell uiautomator dump /sdcard/ui.xml 2>&1 | Out-Null
$ctx = & $ADB -s $S shell cat /sdcard/ui.xml
[regex]::Matches($ctx, 'text="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match '进度|上装|下装|鞋|外套|自由|预览|首套|添加|继续|进入' } | Select-Object -First 8
