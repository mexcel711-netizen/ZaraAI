$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Test-Path 'node_modules')) {
  if (Get-Command bun -ErrorAction SilentlyContinue) {
    Write-Host 'Installing ZARA dependencies...' -ForegroundColor Cyan
    bun install
  } else {
    throw 'Install Node.js 20+ and Bun, then run bun install from the repository folder.'
  }
}

$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$env:NOVA_BRIDGE_TOKEN = [Convert]::ToHexString($bytes).ToLowerInvariant()

Write-Host ''
Write-Host 'ZARA Desktop Companion is starting.' -ForegroundColor Cyan
Write-Host 'Copy this private pairing token into ZARA > Desktop Bridge:' -ForegroundColor Yellow
Write-Host $env:NOVA_BRIDGE_TOKEN -ForegroundColor Green
Write-Host 'Keep this window open while using desktop voice commands.' -ForegroundColor Gray
Start-Process 'https://nova-ai.mexcel711.workers.dev'
node desktop-companion/agent.mjs
