Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ProjectRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
function Get-InfraEnvPath {
  return Join-Path (Get-ProjectRoot) 'infra/.env.infrastructure'
}

function Read-InfraEnv {
  $values = @{}
  $path = Get-InfraEnvPath
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Infrastructure environment file does not exist: $path"
  }
  foreach ($line in Get-Content -LiteralPath $path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $index = $trimmed.IndexOf('=')
    if ($index -lt 1) { continue }
    $values[$trimmed.Substring(0, $index)] = $trimmed.Substring($index + 1)
  }
  return $values
}

function Invoke-InfraCompose {
  param(
    [Parameter(Mandatory)] [string] $Role,
    [Parameter(ValueFromRemainingArguments)] [string[]] $Arguments
  )
  $root = Get-ProjectRoot
  $compose = Join-Path $root 'infra/docker-compose.yml'
  $envFile = Get-InfraEnvPath
  & docker compose --project-name cthoj-infrastructure --env-file $envFile --file $compose --profile $Role @Arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed with exit code $LASTEXITCODE" }
}

function Assert-DockerReady {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is not installed. Run scripts/bootstrap-windows.ps1 after enabling CPU virtualization in BIOS.'
  }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is installed but the Linux container engine is not running.' }
  & docker compose version *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is required.' }
}
