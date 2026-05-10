param(
    [string]$BaseUrl = "http://localhost:3000/api",
    [ValidateSet("Both", "Research", "Practical")]
    [string]$Mode = "Both",
    [int]$Iterations = 50,
    [int]$CaseLimit = 0,
    [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"

if ($Iterations -lt 1) {
    throw "Iterations must be at least 1."
}

if ([string]::IsNullOrWhiteSpace($ReportPath)) {
    $ReportPath = Join-Path $PSScriptRoot "reports/title-stress-report.json"
}

$reportDir = Split-Path -Parent $ReportPath
if ($reportDir -and -not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir | Out-Null
}

$qualityScriptPath = Join-Path $PSScriptRoot "quality.ps1"
if (-not (Test-Path $qualityScriptPath)) {
    throw "Could not find quality test script at $qualityScriptPath"
}

$runReportDir = Join-Path $PSScriptRoot "reports/.stress-runs"
if (Test-Path $runReportDir) {
    Remove-Item -LiteralPath $runReportDir -Recurse -Force
}
New-Item -ItemType Directory -Path $runReportDir | Out-Null

function Write-Pass {
    param([string]$Message)
    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function To-Array {
    param($Value)

    if ($null -eq $Value) {
        return @()
    }

    if ($Value -is [System.Array]) {
        return @($Value)
    }

    return @($Value)
}

$aggregateByCase = @{}
$runSummaries = New-Object System.Collections.ArrayList

Write-Host "Base URL: $BaseUrl"
Write-Host "Mode: $Mode"
Write-Host "Iterations: $Iterations"
if ($CaseLimit -gt 0) {
    Write-Host "Case limit: $CaseLimit"
}
Write-Host ""

for ($iteration = 1; $iteration -le $Iterations; $iteration++) {
    $runReportPath = Join-Path $runReportDir ("run-{0:D3}.json" -f $iteration)
    Write-Host ("Run {0}/{1}" -f $iteration, $Iterations) -ForegroundColor Cyan

    $args = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $qualityScriptPath,
        "-BaseUrl", $BaseUrl,
        "-Mode", $Mode,
        "-ReportPath", $runReportPath
    )

    if ($CaseLimit -gt 0) {
        $args += @("-CaseLimit", [string]$CaseLimit)
    }

    & powershell @args
    $qualityExitCode = $LASTEXITCODE

    if (-not (Test-Path $runReportPath)) {
        throw "Quality test did not produce report file for iteration $iteration."
    }

    $runData = Get-Content $runReportPath | ConvertFrom-Json
    $caseResults = To-Array $runData

    $passCount = @($caseResults | Where-Object { $_.status -eq "PASS" }).Count
    $warnCount = @($caseResults | Where-Object { $_.status -eq "WARN" }).Count
    $failCount = @($caseResults | Where-Object { $_.status -eq "FAIL" }).Count

    $null = $runSummaries.Add([pscustomobject]@{
        iteration = $iteration
        exitCode  = $qualityExitCode
        passCount = $passCount
        warnCount = $warnCount
        failCount = $failCount
        report    = $runReportPath
    })

    foreach ($caseResult in $caseResults) {
        $caseId = [string]$caseResult.caseId
        if (-not $aggregateByCase.ContainsKey($caseId)) {
            $aggregateByCase[$caseId] = [ordered]@{
                caseId               = $caseId
                specializationOption = [string]$caseResult.specializationOption
                thesisType           = [string]$caseResult.thesisType
                passCount            = 0
                warnCount            = 0
                failCount            = 0
                sampleWarnings       = New-Object System.Collections.ArrayList
                sampleFailures       = New-Object System.Collections.ArrayList
            }
        }

        $bucket = $aggregateByCase[$caseId]
        switch ([string]$caseResult.status) {
            "PASS" {
                $bucket.passCount++
            }
            "WARN" {
                $bucket.warnCount++
                if ($bucket.sampleWarnings.Count -lt 5) {
                    $null = $bucket.sampleWarnings.Add([pscustomobject]@{
                        iteration = $iteration
                        title     = [string]$caseResult.generatedTitle
                        warnings  = To-Array $caseResult.warnings
                    })
                }
            }
            "FAIL" {
                $bucket.failCount++
                if ($bucket.sampleFailures.Count -lt 5) {
                    $null = $bucket.sampleFailures.Add([pscustomobject]@{
                        iteration = $iteration
                        title     = [string]$caseResult.generatedTitle
                        errors    = To-Array $caseResult.errors
                        warnings  = To-Array $caseResult.warnings
                    })
                }
            }
        }
    }
}

$aggregateResults = New-Object System.Collections.ArrayList
foreach ($entry in $aggregateByCase.GetEnumerator()) {
    $value = $entry.Value
    $null = $aggregateResults.Add([pscustomobject]@{
        caseId               = $value.caseId
        specializationOption = $value.specializationOption
        thesisType           = $value.thesisType
        passCount            = $value.passCount
        warnCount            = $value.warnCount
        failCount            = $value.failCount
        sampleWarnings       = @($value.sampleWarnings)
        sampleFailures       = @($value.sampleFailures)
    })
}
$aggregateResults = @($aggregateResults | Sort-Object failCount, warnCount -Descending)

$overallPass = @($aggregateResults | Measure-Object -Property passCount -Sum).Sum
$overallWarn = @($aggregateResults | Measure-Object -Property warnCount -Sum).Sum
$overallFail = @($aggregateResults | Measure-Object -Property failCount -Sum).Sum
$totalEvaluations = $overallPass + $overallWarn + $overallFail

$topIssues = @(
    $aggregateResults |
    Where-Object { $_.failCount -gt 0 -or $_.warnCount -gt 0 } |
    Select-Object -First 10
)

$finalReport = [pscustomobject]@{
    baseUrl          = $BaseUrl
    mode             = $Mode
    iterations       = $Iterations
    caseLimit        = $CaseLimit
    totalEvaluations = $totalEvaluations
    overall          = [pscustomobject]@{
        passCount = $overallPass
        warnCount = $overallWarn
        failCount = $overallFail
    }
    runSummaries     = @($runSummaries)
    cases            = @($aggregateResults)
    topIssues        = @($topIssues)
}

$finalReport | ConvertTo-Json -Depth 20 | Set-Content -Path $ReportPath -Encoding UTF8

Write-Host ""
Write-Host ("Overall: {0} pass, {1} warn, {2} fail across {3} evaluations." -f $overallPass, $overallWarn, $overallFail, $totalEvaluations)
Write-Host "Report: $ReportPath"

if ($topIssues.Count -gt 0) {
    Write-Host ""
    Write-Host "Top issue cases:" -ForegroundColor Yellow
    foreach ($issue in $topIssues) {
        $summary = "{0} [{1}] -> warn={2}, fail={3}" -f $issue.caseId, $issue.specializationOption, $issue.warnCount, $issue.failCount
        if ($issue.failCount -gt 0) {
            Write-Fail $summary
        } else {
            Write-Warn $summary
        }
    }
} else {
    Write-Pass "No warning or failure cases were observed across the stress runs."
}

if ($overallFail -gt 0) {
    exit 1
}

if ($overallWarn -gt 0) {
    exit 2
}

exit 0
