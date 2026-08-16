param([string] $OutputDirectory)

. (Join-Path $PSScriptRoot 'infra-common.ps1')
Assert-DockerReady
$root = Get-ProjectRoot
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root "backups/$timestamp" }
$resolvedParent = Split-Path -Parent $OutputDirectory
New-Item -ItemType Directory -Force -Path $resolvedParent | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$envValues = Read-InfraEnv

function Export-PostgresDatabase {
  param([string] $Container, [string] $User, [string] $Database, [string] $Name)
  $remote = "/tmp/$Name.dump"
  & docker exec $Container pg_dump -U $User -d $Database -Fc -f $remote
  if ($LASTEXITCODE -ne 0) { throw "Failed to back up $Container" }
  & docker cp "${Container}:$remote" (Join-Path $OutputDirectory "$Name.dump")
  if ($LASTEXITCODE -ne 0) { throw "Failed to copy backup from $Container" }
  & docker exec $Container rm -f $remote
}

if ((& docker inspect -f '{{.State.Running}}' cthoj-postgres 2>$null) -eq 'true') {
  Export-PostgresDatabase -Container 'cthoj-postgres' -User $envValues.CTHOJ_POSTGRES_USER -Database $envValues.CTHOJ_POSTGRES_DB -Name 'cthoj-postgres'
}
if ((& docker inspect -f '{{.State.Running}}' judge0-db 2>$null) -eq 'true') {
  Export-PostgresDatabase -Container 'judge0-db' -User $envValues.JUDGE0_POSTGRES_USER -Database $envValues.JUDGE0_POSTGRES_DB -Name 'judge0-postgres'
}
if ((& docker inspect -f '{{.State.Running}}' cthoj-redis 2>$null) -eq 'true') {
  & docker exec cthoj-redis redis-cli --no-auth-warning -a $envValues.CTHOJ_REDIS_PASSWORD SAVE | Out-Null
  & docker cp 'cthoj-redis:/data/dump.rdb' (Join-Path $OutputDirectory 'cthoj-redis.rdb')
}

$manifest = [ordered]@{
  product = 'CTH-OnlineJudge'
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  judge0Version = '1.13.1'
  files = @(Get-ChildItem -LiteralPath $OutputDirectory -File | Select-Object -ExpandProperty Name)
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory 'manifest.json') -Encoding utf8
Write-Host "Backup completed: $OutputDirectory"
