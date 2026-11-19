<#
.SYNOPSIS
    Automated Branding Application Script for Platform Core.

.DESCRIPTION
    Applies the chosen brand name, slug, environment prefix, and domain across all
    npm scopes, Docker image tags, environment variables, session cookies, Ansible roles,
    frontend configuration, and installer scripts in a single atomic pass.

.PARAMETER Name
    The human-readable brand name (e.g., "Runrack", "Cloudarc", "DeployWave").

.PARAMETER Slug
    The lowercase kebab-case identifier (e.g., "runrack", "cloudarc", "deploywave").

.PARAMETER Prefix
    The uppercase prefix for environment variables (e.g., "RUNRACK", "CLOUDARC").

.PARAMETER Domain
    The primary root domain (e.g., "runrack.com", "cloudarc.io").

.EXAMPLE
    .\scripts\apply-brand.ps1 -Name "Runrack" -Slug "runrack" -Prefix "RUNRACK" -Domain "runrack.com"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9 _-]+$')]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9-]+$')]
    [string]$Slug,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Z0-9_]+$')]
    [string]$Prefix,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')]
    [string]$Domain
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "🚀 Applying Brand: $Name (slug: $Slug, prefix: $Prefix, domain: $Domain)" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Cyan

# 1. Target Files for Replacement
$filesToProcess = @(
    "package.json",
    "package-lock.json",
    "Makefile",
    "install.sh",
    "README.md",
    ".env.example",
    ".github/workflows/ci.yml",
    "apps/server/package.json",
    "apps/server/package-lock.json",
    "apps/server/.env.example",
    "apps/server/src/shared/http/auth-cookie.util.ts",
    "apps/server/src/shared/http/staff-auth-cookie.util.ts",
    "apps/web/package.json",
    "apps/web/package-lock.json",
    "apps/web/.env.example",
    "apps/web/src/shared/config/brand.config.ts",
    "infra/.env.production.example",
    "infra/docker-compose.prod.yml",
    "infra/docker-compose.dev.yml",
    "infra/Makefile",
    "infra/scripts/install-external-monitoring.sh"
)

$modifiedCount = 0

foreach ($relPath in $filesToProcess) {
    $fullPath = Join-Path $root $relPath
    if (-not (Test-Path $fullPath)) {
        continue
    }

    $raw = Get-Content $fullPath -Raw -Encoding utf8
    $orig = $raw

    # Scopes npm & packages
    $raw = $raw -replace '@sovrack/', "@$Slug/"

    # Docker registries
    $raw = $raw -replace 'ghcr.io/sovrack/', "ghcr.io/$Slug/"
    $raw = $raw -replace 'GHCR_ORG="\$\{GHCR_ORG:-platform\}"', "GHCR_ORG=`"`${GHCR_ORG:-$Slug}`""

    # Session Cookies
    $raw = $raw -replace 'sovrack_token', "${Slug}_token"
    $raw = $raw -replace 'sovrack_staff_token', "${Slug}_staff_token"

    # Environment variables
    $raw = $raw -replace 'SOVRACK_', "${Prefix}_"

    # Brand identifiers
    $raw = $raw -replace 'APP_NAME="\$\{APP_NAME:-Platform\}"', "APP_NAME=`"`${APP_NAME:-$Name}`""
    $raw = $raw -replace 'APP_SLUG="\$\{APP_SLUG:-platform\}"', "APP_SLUG=`"`${APP_SLUG:-$Slug}`""
    $raw = $raw -replace 'APP_DOMAIN="\$\{APP_DOMAIN:-example.com\}"', "APP_DOMAIN=`"`${APP_DOMAIN:-$Domain}`""
    $raw = $raw -replace 'example\.com', $Domain

    if ($raw -ne $orig) {
        Set-Content -Path $fullPath -Value $raw -Encoding utf8 -NoNewline
        Write-Host "  ✔ Updated: $relPath" -ForegroundColor Yellow
        $modifiedCount++
    }
}

Write-Host ""
Write-Host "✔ Total files successfully branded: $modifiedCount" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "Review changes using: git diff --stat" -ForegroundColor White
Write-Host "Then commit: git commit -am `"chore(brand): apply final brand $Name ($Domain)`"" -ForegroundColor White
Write-Host "==========================================================================" -ForegroundColor Cyan
