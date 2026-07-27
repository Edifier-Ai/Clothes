param(
    [string]$ScreenDirectory = (Join-Path $PSScriptRoot 'screens\direction-3-quiet-luxury')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$screenTitles = @{
    'ONB-01' = '欢迎'
    'ONB-02' = '三步价值'
    'ONB-03' = '本地隐私'
    'ONB-04' = '目标选择'
    'ONB-05' = '12 件启动'
    'ONB-06' = '阶段预览'
    'ONB-07' = '首组搭配'
    'IMP-01' = '导入来源'
    'IMP-02' = '批量队列'
    'IMP-03' = '抠图审核'
    'IMP-04' = '蒙版修边'
    'IMP-05' = '信息确认'
    'TDY-01' = '今日默认'
    'TDY-02' = '推荐理由'
    'TDY-03' = '只换一件'
    'TDY-04' = '换一套'
    'TDY-05' = '推荐模式'
    'TDY-06' = '记录已穿'
    'TDY-07' = '穿后状态'
    'TDY-08' = '天气降级'
    'CLS-01' = '衣橱首页'
    'CLS-03' = '单品详情'
    'LOK-03' = '自由画布'
    'PLN-01' = '月历'
    'TRP-05' = '打包清单'
    'STA-01' = '统计总览'
    'SHP-02' = '购物守门'
    'SET-01' = '设置'
    'SET-05' = 'AI 与隐私'
}

function New-ContactSheet {
    param(
        [string]$Title,
        [string[]]$FileNames,
        [int]$Columns,
        [string]$OutputName
    )

    $padding = 24
    $headerHeight = 112
    $cellWidth = 278
    $thumbWidth = 226
    $thumbHeight = 490
    $labelHeight = 56
    $cellHeight = $thumbHeight + $labelHeight + $padding
    $rows = [Math]::Ceiling($FileNames.Count / $Columns)
    $canvasWidth = ($Columns * $cellWidth) + (($Columns + 1) * $padding)
    $canvasHeight = $headerHeight + ($rows * $cellHeight) + $padding

    $bitmap = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $titleFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 24, [System.Drawing.FontStyle]::Bold)
    $subtitleFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 11, [System.Drawing.FontStyle]::Regular)
    $labelFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 11, [System.Drawing.FontStyle]::Bold)
    $backgroundBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(246, 242, 235))
    $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 253, 249))
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(43, 40, 36))
    $mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(111, 101, 91))
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(205, 194, 180), 1)

    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.FillRectangle($backgroundBrush, 0, 0, $canvasWidth, $canvasHeight)
        $graphics.DrawString($Title, $titleFont, $titleBrush, $padding, 18)
        $graphics.DrawString('方向 3 · 静奢编辑部  |  独立高保真页面缩略总览', $subtitleFont, $mutedBrush, $padding, 65)

        for ($index = 0; $index -lt $FileNames.Count; $index++) {
            $row = [Math]::Floor($index / $Columns)
            $column = $index % $Columns
            $cellX = $padding + ($column * ($cellWidth + $padding))
            $cellY = $headerHeight + ($row * $cellHeight)
            $imageX = $cellX + [Math]::Floor(($cellWidth - $thumbWidth) / 2)
            $imageY = $cellY
            $imagePath = Join-Path $ScreenDirectory $FileNames[$index]

            if (-not (Test-Path -LiteralPath $imagePath)) {
                throw "Missing screen: $imagePath"
            }

            $graphics.FillRectangle($cardBrush, $cellX, $cellY, $cellWidth, $thumbHeight + $labelHeight)
            $graphics.DrawRectangle($borderPen, $cellX, $cellY, $cellWidth, $thumbHeight + $labelHeight)

            $image = [System.Drawing.Image]::FromFile($imagePath)
            try {
                $scale = [Math]::Min($thumbWidth / $image.Width, $thumbHeight / $image.Height)
                $drawWidth = [Math]::Round($image.Width * $scale)
                $drawHeight = [Math]::Round($image.Height * $scale)
                $drawX = $imageX + [Math]::Floor(($thumbWidth - $drawWidth) / 2)
                $drawY = $imageY + [Math]::Floor(($thumbHeight - $drawHeight) / 2)
                $graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
            }
            finally {
                $image.Dispose()
            }

            $id = [System.IO.Path]::GetFileNameWithoutExtension($FileNames[$index]).Substring(0, 6)
            $label = "$id  $($screenTitles[$id])"
            $labelSize = $graphics.MeasureString($label, $labelFont)
            $labelX = $cellX + (($cellWidth - $labelSize.Width) / 2)
            $labelY = $cellY + $thumbHeight + 16
            $graphics.DrawString($label, $labelFont, $titleBrush, $labelX, $labelY)
        }

        $outputPath = Join-Path $ScreenDirectory $OutputName
        $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        return $outputPath
    }
    finally {
        $borderPen.Dispose()
        $mutedBrush.Dispose()
        $titleBrush.Dispose()
        $cardBrush.Dispose()
        $backgroundBrush.Dispose()
        $labelFont.Dispose()
        $subtitleFont.Dispose()
        $titleFont.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

$activationScreens = @(
    'ONB-01-welcome.png',
    'ONB-02-how-it-works.png',
    'ONB-03-local-privacy.png',
    'ONB-04-goal-selection.png',
    'ONB-05-starter-12.png',
    'ONB-06-halfway-preview.png',
    'ONB-07-first-look.png',
    'IMP-01-import-source.png',
    'IMP-02-batch-queue.png',
    'IMP-03-cutout-review.png',
    'IMP-04-mask-editor.png',
    'IMP-05-metadata-confirm.png'
)

$dailyAndGrowthScreens = @(
    'TDY-01-today-default.png',
    'TDY-02-recommendation-reasons.png',
    'TDY-03-replace-item.png',
    'TDY-04-replace-outfit.png',
    'TDY-05-mode-picker.png',
    'TDY-06-wear-log.png',
    'TDY-07-after-wear-state.png',
    'TDY-08-weather-fallback.png',
    'CLS-01-wardrobe-home.png',
    'CLS-03-item-detail.png',
    'LOK-03-outfit-canvas.png',
    'PLN-01-calendar.png',
    'TRP-05-packing-checklist.png',
    'STA-01-insights.png',
    'SHP-02-shopping-guard.png',
    'SET-01-settings.png',
    'SET-05-ai-photo-privacy.png'
)

$outputs = @(
    New-ContactSheet -Title '核心页面总览 01 · 激活与录入' -FileNames $activationScreens -Columns 4 -OutputName 'CORE-SCREENS-OVERVIEW-01.png'
    New-ContactSheet -Title '核心页面总览 02 · 日常与增长' -FileNames $dailyAndGrowthScreens -Columns 5 -OutputName 'CORE-SCREENS-OVERVIEW-02.png'
)

$outputs | ForEach-Object { Write-Output $_ }
