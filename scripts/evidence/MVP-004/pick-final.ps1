$ADB = "C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe"
$S = "10c1b57d"
$EVID = "C:/Users/Admin/Desktop/Projects/Clothes/scripts/evidence/MVP-004"

& $ADB -s $S shell uiautomator dump /sdcard/ui.xml 2>&1 | Out-Null
& $ADB -s $S pull /sdcard/ui.xml "$EVID/ui.xml" 2>&1 | Out-Null
$content = Get-Content "$EVID/ui.xml" -Raw
$pattern = '<node[^>]*?clickable="true"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
$first = [regex]::Matches($content, $pattern) | Select-Object -First 1
if ($first) {
  $x = [int](([int]$first.Groups[1].Value + [int]$first.Groups[3].Value)/2)
  $y = [int](([int]$first.Groups[2].Value + [int]$first.Groups[4].Value)/2)
  Write-Host "First clickable photo at ($x, $y)"
  & $ADB -s $S shell input tap $x $y
  Start-Sleep -Seconds 4
  & $ADB -s $S shell dumpsys window | findstr "mCurrentFocus" | Select-Object -First 1
  & $ADB -s $S shell uiautomator dump /sdcard/ui.xml 2>&1 | Out-Null
  $ctx = & $ADB -s $S shell cat /sdcard/ui.xml
  Write-Host "=== After pick ==="
  [regex]::Matches($ctx, 'text="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match '进度|上装|下装|鞋|外套|自由|预览|首套|添加|继续|进入|你的' } | Select-Object -First 10
  & $ADB -s $S exec-out screencap -p > "$EVID/onb-05-quota-12.png"
} else {
  Write-Host "No clickable photo found"
}
