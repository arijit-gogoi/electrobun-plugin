# Bootstrap electrobun upstream clone for skill build-reference.
# Idempotent. Usage:
#   ./scripts/bootstrap.ps1            # clone if missing, skip otherwise
#   ./scripts/bootstrap.ps1 -Refresh   # git pull existing clone
#   ./scripts/bootstrap.ps1 -Force     # nuke + reclone
param(
    [switch]$Refresh,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$cacheDir = Join-Path $repoRoot '.cache'
$cloneDir = Join-Path $cacheDir 'electrobun'
$upstream = 'https://github.com/blackboardsh/electrobun.git'

if ($Force -and (Test-Path $cloneDir)) {
    Write-Host "Force: removing $cloneDir"
    Remove-Item -Recurse -Force $cloneDir
}

if (-not (Test-Path $cacheDir)) {
    New-Item -ItemType Directory -Path $cacheDir | Out-Null
}

if (Test-Path $cloneDir) {
    if ($Refresh) {
        Write-Host "Refresh: pulling $cloneDir"
        git -C $cloneDir pull --ff-only
    } else {
        Write-Host "Clone exists at $cloneDir (use -Refresh to pull, -Force to reclone)"
    }
} else {
    Write-Host "Cloning $upstream -> $cloneDir (shallow)"
    git clone --depth 1 $upstream $cloneDir
}

$sha = git -C $cloneDir rev-parse HEAD
Write-Host "electrobun HEAD: $sha"
