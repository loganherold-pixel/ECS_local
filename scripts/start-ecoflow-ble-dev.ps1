param(
  [switch]$VerboseSessionLogs,
  [int]$CaptureMs = 12000
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -LiteralPath "$env:LOCALAPPDATA\Temp\metro-cache" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath ".expo" -Recurse -Force -ErrorAction SilentlyContinue

Remove-Item Env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_CAPTURE -ErrorAction SilentlyContinue
Remove-Item Env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_DYNAMIC_SESSION_PROBE -ErrorAction SilentlyContinue
Remove-Item Env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_VERBOSE_SESSION_LOGS -ErrorAction SilentlyContinue

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$probeKeyBytes = New-Object byte[] 20
$rng.GetBytes($probeKeyBytes)
$rng.Dispose()

$env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_PROBE_PRIVATE_KEY_BASE64 = [Convert]::ToBase64String($probeKeyBytes)
$env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MS = [string]$CaptureMs

if ($VerboseSessionLogs) {
  $env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_VERBOSE_SESSION_LOGS = "1"
}

npx expo start --clear
