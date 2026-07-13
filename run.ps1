<#
  run.ps1 - start the WhatsApp LLM relay and keep it alive.

  Usage:
    cd path\to\whatsapp-llm-relay
    ./run.ps1

  - Installs deps (first run only) and builds, then starts the server.
  - Auto-restarts the server if it crashes (3s backoff).
  - Press Ctrl+C once to stop.
#>

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# Windows exit code when a console app is terminated by Ctrl+C.
$CtrlCExit = -1073741510

# First-run setup.
if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing dependencies...' -ForegroundColor Cyan
  npm install --no-audit --no-fund
}

Write-Host 'Building...' -ForegroundColor Cyan
npm run build

while ($true) {
  Write-Host 'Starting server (press Ctrl+C to stop)...' -ForegroundColor Green

  # Run node in this console so Ctrl+C is delivered straight to it.
  node --no-warnings dist/index.js
  $code = $LASTEXITCODE

  # Clean stop (Ctrl+C or normal exit) -> leave the loop.
  if ($code -eq $CtrlCExit -or $code -eq 0) {
    Write-Host 'Stopped.' -ForegroundColor Yellow
    break
  }

  Write-Host "Server exited (code $code). Restarting in 3s... (Ctrl+C to stop)" -ForegroundColor Yellow
  Start-Sleep -Seconds 3
}
