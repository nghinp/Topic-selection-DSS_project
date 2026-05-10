param(
    [string]$BaseUrl = "http://localhost:3000/api",
    [ValidateSet("Both", "Research", "Practical")]
    [string]$Mode = "Both",
    [int]$CaseLimit = 0,
    [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ReportPath)) {
    $ReportPath = Join-Path $PSScriptRoot "reports/title-quality-report.json"
}

$reportDir = Split-Path -Parent $ReportPath
if ($reportDir -and -not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir | Out-Null
}

$majorByGroupId = @{
    "ai_intelligent_systems"               = "CS"
    "data_science_analytics"              = "DS"
    "computer_vision_multimedia"          = "CS"
    "web_software_platform_systems"       = "IT"
    "cybersecurity_trust_systems"         = "IT"
    "iot_embedded_edge_systems"           = "IT"
    "hardware_architecture_fpga"          = "CS"
    "graphics_games_vrar_hci"             = "CS"
    "blockchain_distributed_trust"        = "IT"
    "nlp_language_conversational_systems" = "CS"
}

$stopWords = @(
    "a", "an", "and", "the", "for", "of", "in", "on", "to", "with", "using", "based",
    "development", "design", "implementation", "study"
)

$technicalCueTokens = @(
    "system", "platform", "application", "model", "framework", "method", "approach",
    "algorithm", "architecture", "analysis", "prediction", "classification", "detection",
    "segmentation", "optimization", "recommendation", "monitoring", "retrieval",
    "authentication", "chatbot", "translation", "question", "answering", "forecasting",
    "analytics", "engine", "assistant", "simulation", "recommender", "portal",
    "accelerator", "verification", "proof", "fpga", "game"
)

$researchCueTokens = @(
    "model", "approach", "framework", "analysis", "prediction", "classification",
    "detection", "segmentation", "optimization", "improving", "evaluation",
    "analytics", "simulation", "retrieval", "verification", "proof", "implementation",
    "llm", "transformer", "accelerator", "inference", "fpga", "monitoring"
)

$practicalCueTokens = @(
    "system", "platform", "application", "web", "mobile", "chatbot", "dashboard",
    "monitoring", "management", "support", "implementation", "design", "portal",
    "engine", "assistant", "game", "development"
)

$specializationHintTokensById = @{
    "web_application_development" = @("web", "portal", "platform", "interface", "usability", "application", "workflow", "resource", "access", "digital", "service", "quality")
    "cryptography" = @("encryption", "verification", "credential", "authentication", "secure", "proof")
    "fpga_design" = @("fpga", "accelerator", "hardware", "inference", "architecture")
    "game_development" = @("game", "gamified", "simulation", "vr", "ar", "interactive")
    "blockchain_applications" = @("blockchain", "ledger", "contract", "certificate", "record", "proof", "consensus", "credential", "verification")
    "chatbots" = @("chatbot", "assistant", "dialogue", "question", "answering", "llm", "transformer")
}

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

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Url,
        [object]$Body = $null
    )

    $params = @{
        Method = $Method
        Uri    = $Url
        UseBasicParsing = $true
    }

    if ($null -ne $Body) {
        $params["ContentType"] = "application/json"
        $params["Body"] = ($Body | ConvertTo-Json -Depth 20)
    }

    try {
        $response = Invoke-WebRequest @params
        $json = $null
        if ($response.Content) {
            try {
                $json = $response.Content | ConvertFrom-Json -ErrorAction Stop
            } catch {
                $json = $null
            }
        }

        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Json       = $json
            Raw        = $response.Content
        }
    } catch {
        $httpResponse = $_.Exception.Response
        if (-not $httpResponse) {
            throw
        }

        $stream = $httpResponse.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $raw = $reader.ReadToEnd()
        $reader.Close()

        $json = $null
        if ($raw) {
            try {
                $json = $raw | ConvertFrom-Json -ErrorAction Stop
            } catch {
                $json = $null
            }
        }

        return [pscustomobject]@{
            StatusCode = [int]$httpResponse.StatusCode
            Json       = $json
            Raw        = $raw
        }
    }
}

function Normalize-Text {
    param([AllowNull()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }

    return (($Value.ToLowerInvariant() -replace "[^a-z0-9]+", " ") -replace "\s+", " ").Trim()
}

function Get-ContentTokens {
    param([AllowNull()][string]$Value)

    $normalized = Normalize-Text $Value
    if (-not $normalized) {
        return @()
    }

    return @(
        $normalized.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries) |
        Where-Object { $_ -and ($stopWords -notcontains $_) }
    )
}

function Get-TemplateMap {
    param($TemplateConfig)

    $map = @{}
    foreach ($familyName in $TemplateConfig.templateFamilies.PSObject.Properties.Name) {
        $family = $TemplateConfig.templateFamilies.$familyName
        foreach ($template in $family.templates) {
            $map[$template.id] = [pscustomobject]@{
                id      = $template.id
                pattern = $template.pattern
                slots   = @($template.slots)
                family  = $familyName
            }
        }
    }

    return $map
}

function Render-Template {
    param(
        [string]$Pattern,
        $Components
    )

    $rendered = $Pattern
    foreach ($property in $Components.PSObject.Properties) {
        $slot = [regex]::Escape($property.Name)
        $rendered = [regex]::Replace($rendered, "\{$slot\}", [string]$property.Value)
    }
    return $rendered
}

function Apply-GeneratorPostProcessing {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }

    $result = $Value
    # Fix adjacent duplicate words
    $result = $result -replace "\b([A-Za-z]+)\s+\1\b", '$1'
    
    # Fix 'a/an' grammatical errors with exception handling for vowel-letters with consonant-sounds (User, etc.)
    $evaluator = {
        param($m)
        $article = $m.Groups[1].Value
        $word = $m.Groups[2].Value.ToLower()
        $firstChar = $word[0]
        $exceptions = @('user', 'universal', 'unit', 'one', 'once')
        
        $needsAn = "aeio".Contains($firstChar) -or ($firstChar -eq 'u' -and (-not ($exceptions | Where-Object { $word.StartsWith($_) })))
        
        if ($needsAn) {
            return "$($article)n $($m.Groups[2].Value)"
        } else {
            return "$($article) $($m.Groups[2].Value)"
        }
    }
    
    $result = [regex]::Replace($result, "\b([Aa])\s+([AEIOaeio][a-zA-Z]*)", $evaluator)
    
    return $result
}

function Test-TokenOverlap {
    param(
        [string]$Title,
        [string[]]$ExpectedTokens
    )

    $titleTokens = @(Get-ContentTokens $Title)
    $checkTokens = @($ExpectedTokens | Where-Object { $_ } | Select-Object -Unique)

    if ($titleTokens.Count -eq 0 -or $checkTokens.Count -eq 0) {
        return $false
    }

    foreach ($token in $checkTokens) {
        if ($titleTokens -contains $token) {
            return $true
        }
    }

    return $false
}

function New-CaseResult {
    param(
        [string]$CaseId,
        [string]$Status,
        [string]$Message,
        [string[]]$Errors,
        [string[]]$Warnings,
        [hashtable]$Meta
    )

    return [pscustomobject]@{
        caseId               = $CaseId
        status               = $Status
        message              = $Message
        major                = $Meta.major
        thesisType           = $Meta.thesisType
        specializationGroup  = $Meta.specializationGroup
        specializationOption = $Meta.specializationOption
        directionGroup       = $Meta.directionGroup
        directionOption      = $Meta.directionOption
        selectedTemplate     = $Meta.selectedTemplate
        selectedComponents   = $Meta.selectedComponents
        generatedTitle       = $Meta.generatedTitle
        errors               = @($Errors)
        warnings             = @($Warnings)
    }
}

function Review-GeneratedTitle {
    param(
        $Case,
        $GenerationResult,
        $TemplateMap
    )

    $errors = New-Object System.Collections.Generic.List[string]
    $warnings = New-Object System.Collections.Generic.List[string]

    $title = [string]$GenerationResult.best_topic
    $templateId = [string]$GenerationResult.selected_template
    $components = $GenerationResult.selected_components
    $template = $TemplateMap[$templateId]
    $normalizedTitle = Normalize-Text $title

    if ([string]::IsNullOrWhiteSpace($title)) {
        $errors.Add("Generated title is empty.")
    }

    if ($title -match "\{.+?\}" -or $title -match "(?i)\b(undefined|null|nan|n/a)\b") {
        $errors.Add("Generated title still contains unresolved placeholders or invalid placeholder text.")
    }

    if ($title.Contains([string][char]0xFFFD)) {
        $errors.Add("Generated title contains broken encoding characters.")
    }

    if (-not $template) {
        $errors.Add("selected_template was not found in template.json.")
    }

    if ($template -and -not $components) {
        $errors.Add("selected_components is missing even though a template was returned.")
    }

    $titleLength = $title.Length
    if ($titleLength -lt 18) {
        $errors.Add("Generated title is too short and likely too vague.")
    } elseif ($titleLength -gt 160) {
        $warnings.Add("Generated title is very long and may be too broad.")
    }

    $wordCount = @(Get-ContentTokens $title).Count
    if ($wordCount -lt 3) {
        $errors.Add("Generated title has too few meaningful words.")
    } elseif ($wordCount -gt 18) {
        $warnings.Add("Generated title has many meaningful words and may be over-scoped.")
    }

    if ($title -match "(?i)\b([a-z0-9]+)\s+\1\b") {
        $errors.Add("Generated title repeats the same word consecutively.")
    }

    if ($template -and $components) {
        foreach ($slot in $template.slots) {
            $value = [string]$components.$slot
            if ([string]::IsNullOrWhiteSpace($value)) {
                $errors.Add(("Template slot {0} is missing in selected_components." -f $slot))
                continue
            }

            if ($normalizedTitle -notlike "*$(Normalize-Text $value)*") {
                $errors.Add(("Component {0}={1} does not appear in the final title." -f $slot, $value))
            }
        }

        $expectedTitle = Render-Template -Pattern $template.pattern -Components $components
        $postProcessedExpectedTitle = Apply-GeneratorPostProcessing $expectedTitle
        if ((Normalize-Text $postProcessedExpectedTitle) -ne $normalizedTitle) {
            $errors.Add("Final title does not match the selected template pattern after slot replacement.")
        }
    }

    $candidateList = @($GenerationResult.all_scored_candidates)
    if ($candidateList.Count -eq 0) {
        $errors.Add("all_scored_candidates is empty.")
    } elseif ((Normalize-Text $candidateList[0].text) -ne $normalizedTitle) {
        $errors.Add("best_topic is not the top item in all_scored_candidates.")
    }

    $contentTokens = @(Get-ContentTokens $title)
    $technicalOverlap = @($contentTokens | Where-Object { $technicalCueTokens -contains $_ } | Select-Object -Unique)
    if ($technicalOverlap.Count -eq 0) {
        $warnings.Add("Title lacks a clear technical cue such as system, model, framework, prediction, or classification.")
    }

    $directionExpected = @()
    $directionExpected += Get-ContentTokens $Case.DirectionGroupLabel
    $directionExpected += Get-ContentTokens $Case.DirectionOptionLabel
    foreach ($keyword in @($Case.DirectionKeywords)) {
        $directionExpected += Get-ContentTokens $keyword
    }
    if ($directionExpected -contains "education" -or $directionExpected -contains "learning" -or $directionExpected -contains "educational") {
        $directionExpected += @("elearning", "student", "academic", "learner", "course", "university")
    }
    if (-not (Test-TokenOverlap -Title $title -ExpectedTokens $directionExpected)) {
        $warnings.Add("Title shows weak overlap with the chosen application direction.")
    }

    $specializationExpected = @()
    $specializationExpected += Get-ContentTokens $Case.SpecializationGroupLabel
    $specializationExpected += Get-ContentTokens $Case.SpecializationOptionLabel
    foreach ($keyword in @($Case.SpecializationKeywords)) {
        $specializationExpected += Get-ContentTokens $keyword
    }
    foreach ($keyword in @($specializationHintTokensById[$Case.SpecializationOptionId])) {
        $specializationExpected += Get-ContentTokens $keyword
    }
    if (-not (Test-TokenOverlap -Title $title -ExpectedTokens $specializationExpected)) {
        $warnings.Add("Title shows weak overlap with the chosen specialization.")
    }

    if ($Case.ThesisType -eq "Research") {
        $researchOverlap = @($contentTokens | Where-Object { $researchCueTokens -contains $_ } | Select-Object -Unique)
        if ($researchOverlap.Count -eq 0) {
            $warnings.Add("Research title lacks a strong research cue such as model, approach, prediction, or analysis.")
        }
    }

    if ($Case.ThesisType -eq "Practical") {
        $practicalOverlap = @($contentTokens | Where-Object { $practicalCueTokens -contains $_ } | Select-Object -Unique)
        if ($practicalOverlap.Count -eq 0) {
            $warnings.Add("Practical title lacks a strong implementation cue such as system, platform, or application.")
        }
    }

    $meta = @{
        major                = $Case.Major
        thesisType           = $Case.ThesisType
        specializationGroup  = $Case.SpecializationGroupLabel
        specializationOption = $Case.SpecializationOptionLabel
        directionGroup       = $Case.DirectionGroupLabel
        directionOption      = $Case.DirectionOptionLabel
        selectedTemplate     = $templateId
        selectedComponents   = $components
        generatedTitle       = $title
    }

    if ($errors.Count -gt 0) {
        return New-CaseResult -CaseId $Case.CaseId -Status "FAIL" -Message "Hard title issues found." -Errors $errors.ToArray() -Warnings $warnings.ToArray() -Meta $meta
    }

    if ($warnings.Count -gt 0) {
        return New-CaseResult -CaseId $Case.CaseId -Status "WARN" -Message "Title generated, but there are suitability warnings." -Errors @() -Warnings $warnings.ToArray() -Meta $meta
    }

    return New-CaseResult -CaseId $Case.CaseId -Status "PASS" -Message "Title passed current structural and suitability checks." -Errors @() -Warnings @() -Meta $meta
}

Write-Host "Base URL: $BaseUrl"
Write-Host "Mode: $Mode"
Write-Host "Assumption: backend server is already running."
Write-Host ""

$configResponse = Invoke-Api -Method "GET" -Url "$BaseUrl/topic-generation/config"
if ($configResponse.StatusCode -ne 200 -or -not $configResponse.Json) {
    throw "Could not load topic generation config from $BaseUrl/topic-generation/config"
}

$templateMap = Get-TemplateMap -TemplateConfig $configResponse.Json.template

$thesisTypes = switch ($Mode) {
    "Research" { @("Research") }
    "Practical" { @("Practical") }
    default { @("Research", "Practical") }
}

$cases = New-Object System.Collections.Generic.List[object]

foreach ($group in $configResponse.Json.step2.groups) {
    $direction = $configResponse.Json.step3.groups |
        Where-Object { $_.allowed_step2_groups -contains $group.groupId } |
        Select-Object -First 1

    if (-not $direction) {
        continue
    }

    $specializationOption = $group.options[0]
    $directionOption = $direction.options[0]
    $skills = @()
    $skillSet = $configResponse.Json.step4.skillSetsByStep2Group.($group.groupId)
    if ($skillSet -and $skillSet.options) {
        $skills = @($skillSet.options | Select-Object -First 2 | ForEach-Object { $_.id })
    }

    foreach ($thesisType in $thesisTypes) {
        $major = $majorByGroupId[$group.groupId]
        if (-not $major) {
            $major = "IT"
        }

        $cases.Add([pscustomobject]@{
            CaseId                    = ("{0}-{1}" -f $group.groupId, $thesisType.ToLowerInvariant())
            Major                     = $major
            ThesisType                = $thesisType
            SpecializationGroupId     = $group.groupId
            SpecializationGroupLabel  = [string]$group.label
            SpecializationOptionId    = [string]$specializationOption.id
            SpecializationOptionLabel = [string]$specializationOption.label
            SpecializationKeywords    = @($group.keywords)
            DirectionGroupLabel       = [string]$direction.label
            DirectionOptionId         = [string]$directionOption.id
            DirectionOptionLabel      = [string]$directionOption.label
            DirectionKeywords         = @($direction.keywords)
            Skills                    = @($skills)
        })
    }
}

if ($CaseLimit -gt 0) {
    $cases = @($cases | Select-Object -First $CaseLimit)
}

if ($cases.Count -eq 0) {
    throw "No title quality cases could be built from config."
}

$results = New-Object System.Collections.Generic.List[object]

foreach ($case in $cases) {
    Write-Host ("Testing {0} [{1} / {2}]" -f $case.CaseId, $case.SpecializationOptionLabel, $case.DirectionOptionLabel) -ForegroundColor Cyan

    $payload = @{
        major                    = $case.Major
        technical_specialization = $case.SpecializationOptionId
        application_direction    = $case.DirectionOptionId
        skills                   = @($case.Skills)
        thesis_type              = $case.ThesisType
        include_keywords         = @()
        exclude_keywords         = @()
    }

    $response = Invoke-Api -Method "POST" -Url "$BaseUrl/topic-generation/generate" -Body $payload
    if ($response.StatusCode -ne 200 -or -not $response.Json) {
        $failure = New-CaseResult -CaseId $case.CaseId -Status "FAIL" -Message "Generate API failed for this case." -Errors @("HTTP $($response.StatusCode): $($response.Raw)") -Warnings @() -Meta @{
            major                = $case.Major
            thesisType           = $case.ThesisType
            specializationGroup  = $case.SpecializationGroupLabel
            specializationOption = $case.SpecializationOptionLabel
            directionGroup       = $case.DirectionGroupLabel
            directionOption      = $case.DirectionOptionLabel
            selectedTemplate     = ""
            generatedTitle       = ""
        }
        $results.Add($failure)
        Write-Fail "$($case.CaseId) -> generate API returned HTTP $($response.StatusCode)"
        continue
    }

    $review = Review-GeneratedTitle -Case $case -GenerationResult $response.Json -TemplateMap $templateMap
    $results.Add($review)

    switch ($review.status) {
        "PASS" {
            Write-Pass "$($case.CaseId) -> $($review.generatedTitle)"
        }
        "WARN" {
            Write-Warn "$($case.CaseId) -> $($review.generatedTitle)"
            foreach ($warning in $review.warnings) {
                Write-Host "  - $warning" -ForegroundColor DarkYellow
            }
        }
        default {
            Write-Fail "$($case.CaseId) -> $($review.generatedTitle)"
            foreach ($issue in $review.errors) {
                Write-Host "  - $issue" -ForegroundColor DarkRed
            }
            foreach ($warning in $review.warnings) {
                Write-Host "  - Warning: $warning" -ForegroundColor DarkYellow
            }
        }
    }
}

$results | ConvertTo-Json -Depth 20 | Set-Content -Path $ReportPath -Encoding UTF8

$passCount = @($results | Where-Object { $_.status -eq "PASS" }).Count
$warnCount = @($results | Where-Object { $_.status -eq "WARN" }).Count
$failCount = @($results | Where-Object { $_.status -eq "FAIL" }).Count

Write-Host ""
Write-Host "Summary: $passCount pass, $warnCount warn, $failCount fail."
Write-Host "Report: $ReportPath"
Write-Host "Exit code: 0 = clean, 2 = warnings only, 1 = hard errors."

if ($failCount -gt 0) {
    exit 1
}

if ($warnCount -gt 0) {
    exit 2
}

exit 0
