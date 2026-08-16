Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'infra-common.ps1')

function New-HexSecret {
  param([int] $Bytes = 32)
  $buffer = [byte[]]::new($Bytes)
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
  return ([BitConverter]::ToString($buffer) -replace '-', '').ToLowerInvariant()
}

function Set-EnvValue {
  param(
    [Parameter(Mandatory)] [string] $Content,
    [Parameter(Mandatory)] [string] $Name,
    [Parameter(Mandatory)] [string] $Value
  )
  $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
  if ([regex]::IsMatch($Content, $pattern)) {
    return [regex]::Replace($Content, $pattern, { param($match) "$Name=$Value" })
  }
  return $Content.TrimEnd() + [Environment]::NewLine + "$Name=$Value" + [Environment]::NewLine
}

$root = Get-ProjectRoot
$envPath = Join-Path $root '.env'
$examplePath = Join-Path $root '.env.example'
$content = if (Test-Path -LiteralPath $envPath) {
  Get-Content -Raw -LiteralPath $envPath
} else {
  Get-Content -Raw -LiteralPath $examplePath
}
$values = Read-InfraEnv

$jwtMatch = [regex]::Match($content, '(?m)^JWT_SECRET=(.*)$')
if (-not $jwtMatch.Success -or -not $jwtMatch.Groups[1].Value -or $jwtMatch.Groups[1].Value -like 'replace-*') {
  $content = Set-EnvValue -Content $content -Name 'JWT_SECRET' -Value (New-HexSecret)
}

$databaseUrl = "postgresql://$($values.CTHOJ_POSTGRES_USER):$($values.CTHOJ_POSTGRES_PASSWORD)@127.0.0.1:$($values.CTHOJ_POSTGRES_PORT)/$($values.CTHOJ_POSTGRES_DB)"
$redisUrl = "redis://:$($values.CTHOJ_REDIS_PASSWORD)@127.0.0.1:$($values.CTHOJ_REDIS_PORT)"
$content = Set-EnvValue -Content $content -Name 'DATABASE_URL' -Value $databaseUrl
$content = Set-EnvValue -Content $content -Name 'REDIS_URL' -Value $redisUrl
$content = Set-EnvValue -Content $content -Name 'JUDGE_PROVIDER' -Value 'judge0'
$content = Set-EnvValue -Content $content -Name 'JUDGE0_BASE_URL' -Value "http://127.0.0.1:$($values.JUDGE0_PORT)"
$content = Set-EnvValue -Content $content -Name 'JUDGE0_AUTH_HEADER' -Value $values.JUDGE0_AUTH_HEADER
$content = Set-EnvValue -Content $content -Name 'JUDGE0_AUTH_TOKEN' -Value $values.JUDGE0_AUTH_TOKEN
$content = Set-EnvValue -Content $content -Name 'JUDGE_MAX_POLL_TIME_MS' -Value '30000'
$content = Set-EnvValue -Content $content -Name 'AI_TIMEOUT_MS' -Value '1800000'
$content = Set-EnvValue -Content $content -Name 'AI_TEST_TIMEOUT_MS' -Value '1800000'

[IO.File]::WriteAllText($envPath, $content, [Text.UTF8Encoding]::new($false))
Write-Host 'Local CTHOJ is configured to use the authenticated Judge0 provider.'
