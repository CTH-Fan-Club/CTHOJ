param(
  [Parameter(Mandatory)] [string] $BackupDirectory,
  [switch] $ConfirmDataReplacement
)

. (Join-Path $PSScriptRoot 'infra-common.ps1')
if (-not $ConfirmDataReplacement) {
  throw 'Restore replaces database content. Re-run with -ConfirmDataReplacement after verifying the target containers.'
}
Assert-DockerReady
$values = Read-InfraEnv

function Import-PostgresDatabase {
  param([string] $Container, [string] $User, [string] $Database, [string] $Dump)
  if (-not (Test-Path -LiteralPath $Dump)) { return }
  $remote = '/tmp/cthoj-restore.dump'
  & docker cp $Dump "${Container}:$remote"
  if ($LASTEXITCODE -ne 0) { throw "Failed to copy restore file to $Container" }
  & docker exec $Container pg_restore -U $User -d $Database --clean --if-exists --no-owner $remote
  if ($LASTEXITCODE -ne 0) { throw "Failed to restore $Container" }
  & docker exec $Container rm -f $remote
}

Import-PostgresDatabase -Container 'cthoj-postgres' -User $values.CTHOJ_POSTGRES_USER -Database $values.CTHOJ_POSTGRES_DB -Dump (Join-Path $BackupDirectory 'cthoj-postgres.dump')
Import-PostgresDatabase -Container 'judge0-db' -User $values.JUDGE0_POSTGRES_USER -Database $values.JUDGE0_POSTGRES_DB -Dump (Join-Path $BackupDirectory 'judge0-postgres.dump')
Write-Host 'Database restore completed. Redis queue state is intentionally not restored.'
