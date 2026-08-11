param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DevRoot = Join-Path $RepoRoot ".dev"
$YeMuHome = Join-Path $DevRoot "yemu-home"
$MCodeHome = Join-Path $DevRoot "runtime-home"
$ModelsHome = Join-Path $DevRoot "models"
$PythonVenv = Join-Path $RepoRoot ".venv"
$PythonVenvScripts = Join-Path $PythonVenv "Scripts"

New-Item -ItemType Directory -Force -Path $YeMuHome, $MCodeHome, $ModelsHome | Out-Null

# YEMU_HOME remains the internal compatibility variable until the daemon rename migration.
$env:YEMU_HOME = $YeMuHome
$env:MCODE_CONFIG_DIR = $MCodeHome
$env:YEMU_LOCAL_MODELS_DIR = $ModelsHome
$env:VIRTUAL_ENV = $PythonVenv
$env:PATH = "$PythonVenvScripts;$(Join-Path $RepoRoot 'node_modules\.bin');$env:PATH"

if ($Install) {
    Push-Location $RepoRoot
    try {
        npm ci
    } finally {
        Pop-Location
    }
}

Write-Host @"
======================================================
  YeMu AI Novel isolated development environment
======================================================
  YeMu data:        $YeMuHome
  MCODE_CONFIG_DIR: $MCodeHome
  Models:           $ModelsHome
  Python venv:      $PythonVenv
  Daemon:           localhost:6768
======================================================
"@

& (Join-Path $PSScriptRoot "dev.ps1")
