param([string] $OutputDirectory)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root 'artifacts' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $OutputDirectory "cthoj-transfer-$timestamp.tar.gz"

Push-Location $root
try {
  & tar -czf $archive --exclude='.git' --exclude='.env' --exclude='node_modules' --exclude='logs' --exclude='data' --exclude='backups' --exclude='artifacts' --exclude='infra/.env.infrastructure' --exclude='infra/runtime' .
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create transfer archive.' }
} finally {
  Pop-Location
}

$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $stream = [System.IO.File]::OpenRead($archive)
  try { $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose() }
} finally { $sha256.Dispose() }
Set-Content -LiteralPath "$archive.sha256" -Value "$hash  $([IO.Path]::GetFileName($archive))" -Encoding ascii
Write-Host "Transfer bundle: $archive"
Write-Host "SHA256: $hash"
