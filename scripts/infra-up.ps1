param(
  [ValidateSet('main', 'judge', 'all')] [string] $Role = 'all',
  [int] $WaitSeconds = 600
)

. (Join-Path $PSScriptRoot 'infra-common.ps1')
& (Join-Path $PSScriptRoot 'infra-init.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Invoke-InfraCompose -Role $Role pull --ignore-buildable
if ($Role -in @('judge', 'all')) {
  Invoke-InfraCompose -Role $Role build judge0-server
}
Invoke-InfraCompose -Role $Role up -d --wait --wait-timeout $WaitSeconds

$envValues = Read-InfraEnv
if ($Role -in @('main', 'all')) {
  & docker exec cthoj-postgres pg_isready -U $envValues.CTHOJ_POSTGRES_USER -d $envValues.CTHOJ_POSTGRES_DB
  if ($LASTEXITCODE -ne 0) { throw 'CTHOJ PostgreSQL health check failed.' }
  & docker exec cthoj-redis redis-cli --no-auth-warning -a $envValues.CTHOJ_REDIS_PASSWORD ping
  if ($LASTEXITCODE -ne 0) { throw 'CTHOJ Redis health check failed.' }
}
if ($Role -in @('judge', 'all')) {
  $headers = @{ $envValues.JUDGE0_AUTH_HEADER = $envValues.JUDGE0_AUTH_TOKEN }
  $about = Invoke-RestMethod -Uri "http://127.0.0.1:$($envValues.JUDGE0_PORT)/about" -Headers $headers -TimeoutSec 20
  if (-not $about.version) { throw 'Judge0 health check did not return a version.' }
  Write-Host "Judge0 version: $($about.version)"
}

Write-Host "CTHOJ infrastructure role '$Role' is ready."
