$ADB = "C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe"
$S = "10c1b57d"
$EVID = "C:/Users/Admin/Desktop/Projects/Clothes/scripts/evidence/MVP-004"

# force-stop 后重启 → 二次启动应当直达今日页（onboarding completed=true 已持久）
& $ADB -s $S shell am force-stop com.clothes.app
Start-Sleep -Seconds 2
& $ADB -s $S shell am start -n com.clothes.app/com.clothes.app.MainActivity
Start-Sleep -Seconds 6
& $ADB -s $S shell dumpsys window | findstr "mCurrentFocus" | Select-Object -First 1
& $ADB -s $S exec-out screencap -p > "$EVID/onb-07-restart-direct-today.png"
& $ADB -s $S shell uiautomator dump /sdcard/ui.xml 2>&1 | Out-Null
$ctx = & $ADB -s $S shell cat /sdcard/ui.xml
Write-Host "=== After restart (should be today, not onboarding) ==="
[regex]::Matches($ctx, 'text="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match '今日|衣橱|造型|日历|添加|搭配|推荐|欢迎|开始|尚无|整理' } | Select-Object -First 8
