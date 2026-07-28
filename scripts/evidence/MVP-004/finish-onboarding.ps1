$ADB = "C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe"
$S = "10c1b57d"
$EVID = "C:/Users/Admin/Desktop/Projects/Clothes/scripts/evidence/MVP-004"

& $ADB -s $S exec-out screencap -p > "$EVID/onb-07-reveal.png"

& $ADB -s $S shell uiautomator dump /sdcard/ui.xml 2>&1 | Out-Null
$ctx = & $ADB -s $S shell cat /sdcard/ui.xml
$pattern = '<node[^>]*?text="([^"]+)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
$btn = [regex]::Matches($ctx, $pattern) | Where-Object { $_.Groups[1].Value -eq '进入今日' } | Select-Object -First 1
if ($btn) {
  $bx = [int](([int]$btn.Groups[2].Value+[int]$btn.Groups[4].Value)/2)
  $by = [int](([int]$btn.Groups[3].Value+[int]$btn.Groups[5].Value)/2)
  Write-Host "Button at ($bx, $by)"
  & $ADB -s $S shell input tap $bx $by
  Start-Sleep -Seconds 3
  & $ADB -s $S shell dumpsys window | findstr "mCurrentFocus" | Select-Object -First 1
  & $ADB -s $S exec-out screencap -p > "$EVID/onb-07-after-finish.png"
  & $ADB -s $S shell uiautomator dump /sdcard/ui.xml 2>&1 | Out-Null
  $ctx2 = & $ADB -s $S shell cat /sdcard/ui.xml
  Write-Host "=== After finish ==="
  [regex]::Matches($ctx2, 'text="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match '今日|衣橱|造型|日历|添加|搭配|推荐|欢迎|开始|准备' } | Select-Object -First 8
} else {
  Write-Host "Button not found"
}
