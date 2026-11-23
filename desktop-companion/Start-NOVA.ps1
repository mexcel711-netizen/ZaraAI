$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$node = Get-Command node -ErrorAction SilentlyContinue
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $node -and -not $bun) {
  throw 'Install Node.js 20+ or Bun, then start ZARA Desktop Companion again.'
}

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  # Compatible with the Windows PowerShell 5.1/.NET Framework runtime.
  $rng.GetBytes($bytes)
} finally {
  $rng.Dispose()
}
$env:NOVA_BRIDGE_TOKEN = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()

Write-Host ''
Write-Host 'ZARA Desktop Companion is starting.' -ForegroundColor Cyan
Write-Host 'Copy this private pairing token into ZARA > Desktop Bridge:' -ForegroundColor Yellow
Write-Host $env:NOVA_BRIDGE_TOKEN -ForegroundColor Green
Write-Host 'Keep this window open while using desktop actions.' -ForegroundColor Gray
Start-Process 'https://nova-ai.mexcel711.workers.dev'

if ($node) {
  & $node.Source 'desktop-companion/agent.mjs'
} else {
  & $bun.Source 'desktop-companion/agent.mjs'
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
