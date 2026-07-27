[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$errors = [System.Collections.Generic.List[string]]::new()

function Add-PlanningError {
    param([string]$Message)
    $errors.Add($Message)
}

$requiredFiles = @(
    'AGENTS.md',
    'PRODUCT_PLAN.md',
    'TECH_STACK.md',
    'AGENT_GOAL.md',
    'PROGRESS.md',
    'BLOCKED.md',
    'tasks/ROADMAP.md',
    'tasks/EXECUTION_STATE.md',
    'tasks/backlog/README.md',
    'design/HIGH_FIDELITY_UI_SPEC.md',
    'design/CORE_PROMPT_SET.md',
    'design/screens/direction-3-quiet-luxury/INDEX.md'
)

foreach ($relativePath in $requiredFiles) {
    $absolutePath = Join-Path $workspace $relativePath
    if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
        Add-PlanningError "Missing required file: $relativePath"
    }
}

$p0Cards = @(Get-ChildItem -LiteralPath (Join-Path $workspace 'tasks/backlog') -Filter 'MVP-*.md' -File | Sort-Object Name)
$p1Cards = @(Get-ChildItem -LiteralPath (Join-Path $workspace 'tasks/backlog') -Filter 'P1-*.md' -File | Sort-Object Name)

if ($p0Cards.Count -ne 15) {
    Add-PlanningError "Expected 15 P0 cards, found $($p0Cards.Count)"
}
if ($p1Cards.Count -ne 2) {
    Add-PlanningError "Expected 2 P1 cards, found $($p1Cards.Count)"
}

$requiredSections = @(
    '## 用户价值',
    '## 场景与流程',
    '## 必须完成',
    '## 不做',
    '## 状态与失败恢复',
    '## 验收标准',
    '## 测试与证据',
    '## 依赖与优先级'
)

foreach ($card in @($p0Cards) + @($p1Cards)) {
    $content = Get-Content -LiteralPath $card.FullName -Raw
    foreach ($section in $requiredSections) {
        if (-not $content.Contains($section)) {
            Add-PlanningError "$($card.Name) missing section: $section"
        }
    }
}

$indexPath = Join-Path $workspace 'tasks/backlog/README.md'
if (Test-Path -LiteralPath $indexPath) {
    $indexContent = Get-Content -LiteralPath $indexPath -Raw
    $linkedCards = [regex]::Matches($indexContent, '\]\((?<path>(?:MVP|P1)-[^)]+\.md)\)')
    if ($linkedCards.Count -ne 17) {
        Add-PlanningError "Expected 17 task links in backlog index, found $($linkedCards.Count)"
    }
    foreach ($match in $linkedCards) {
        $target = Join-Path (Split-Path -Parent $indexPath) $match.Groups['path'].Value
        if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
            Add-PlanningError "Broken backlog link: $($match.Groups['path'].Value)"
        }
    }
}

$goalPath = Join-Path $workspace 'AGENT_GOAL.md'
$goalChars = 0
if (Test-Path -LiteralPath $goalPath) {
    $goalContent = Get-Content -LiteralPath $goalPath -Raw
    $goalChars = $goalContent.Length
    if ($goalChars -gt 4000) {
        Add-PlanningError "AGENT_GOAL.md exceeds 4000 characters: $goalChars"
    }
    foreach ($phrase in @('我替领导拍的板', 'BLOCKED.md', 'PROGRESS.md', '完成条件', 'MVP-014')) {
        if (-not $goalContent.Contains($phrase)) {
            Add-PlanningError "AGENT_GOAL.md missing required phrase: $phrase"
        }
    }
}

$screenDirectory = Join-Path $workspace 'design/screens/direction-3-quiet-luxury'
$independentScreens = @(
    Get-ChildItem -LiteralPath $screenDirectory -Filter '*.png' -File |
        Where-Object { $_.BaseName -notlike 'CORE-SCREENS-OVERVIEW-*' }
)
if ($independentScreens.Count -ne 29) {
    Add-PlanningError "Expected 29 independent high-fidelity screens, found $($independentScreens.Count)"
}

$uiSpecPath = Join-Path $workspace 'design/HIGH_FIDELITY_UI_SPEC.md'
$uniqueScreenIds = @()
$coveredScreenIds = @()
if (Test-Path -LiteralPath $uiSpecPath) {
    $uiSpec = Get-Content -LiteralPath $uiSpecPath -Raw
    $uniqueScreenIds = @(
        [regex]::Matches($uiSpec, '\|\s*(?<id>(?:ONB|IMP|TDY|CLS|LOK|PLN|TRP|STA|SHP|SET)-\d{2})\s*\|') |
            ForEach-Object { $_.Groups['id'].Value } |
            Sort-Object -Unique
    )
    if ($uniqueScreenIds.Count -ne 59) {
        Add-PlanningError "Expected 59 unique screen IDs in UI spec, found $($uniqueScreenIds.Count)"
    }
    $allCardText = (@($p0Cards) + @($p1Cards) | ForEach-Object {
        Get-Content -LiteralPath $_.FullName -Raw
    }) -join "`n"
    $coveredScreenIds = @($uniqueScreenIds | Where-Object { $allCardText.Contains($_) })
    $missingScreenIds = @($uniqueScreenIds | Where-Object { -not $allCardText.Contains($_) })
    if ($missingScreenIds.Count -gt 0) {
        Add-PlanningError "UI screen IDs not covered by any task card: $($missingScreenIds -join ', ')"
    }
}

$result = [pscustomobject]@{
    P0Cards = $p0Cards.Count
    P1Cards = $p1Cards.Count
    RequiredSectionsComplete = -not ($errors | Where-Object { $_ -like '*missing section*' })
    BacklogLinks = if (Test-Path -LiteralPath $indexPath) { ([regex]::Matches((Get-Content -LiteralPath $indexPath -Raw), '\]\((?:MVP|P1)-[^)]+\.md\)')).Count } else { 0 }
    GoalCharacters = $goalChars
    IndependentScreens = $independentScreens.Count
    UISpecScreenIds = $uniqueScreenIds.Count
    TaskCoveredScreenIds = $coveredScreenIds.Count
    Errors = $errors.Count
}

$result | Format-List

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host 'Planning validation passed.'
