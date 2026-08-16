param(
  [Parameter(Mandatory)] [string] $HostAddress,
  [ValidateSet('main', 'judge', 'all')] [string] $Role,
  [string] $AllowedIp,
  [string] $User = 'root',
  [string] $KeyPath,
  [string] $Bundle
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($Role -eq 'judge' -and -not $AllowedIp) { throw 'Judge deployment requires -AllowedIp with the CTHOJ main server IP.' }
if (-not $Bundle) {
  & (Join-Path $PSScriptRoot 'export-server-bundle.ps1')
  $Bundle = (Get-ChildItem (Join-Path $root 'artifacts') -Filter 'cthoj-transfer-*.tar.gz' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
if (-not (Test-Path -LiteralPath $Bundle)) { throw "Bundle does not exist: $Bundle" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$remoteArchive = "/tmp/cthoj-transfer-$stamp.tar.gz"
$remoteRelease = "/opt/cthoj-infra/releases/$stamp"
$sshOptions = @('-o', 'StrictHostKeyChecking=accept-new')
if ($KeyPath) { $sshOptions += @('-i', $KeyPath) }

& scp @sshOptions $Bundle "${User}@${HostAddress}:$remoteArchive"
if ($LASTEXITCODE -ne 0) { throw 'SCP upload failed.' }
$install = "mkdir -p '$remoteRelease' && tar -xzf '$remoteArchive' -C '$remoteRelease' && chmod +x '$remoteRelease'/scripts/*.sh && '$remoteRelease/scripts/server-install.sh' '$Role' '$AllowedIp' && ln -sfn '$remoteRelease' /opt/cthoj-infra/current && rm -f '$remoteArchive'"
& ssh @sshOptions "${User}@${HostAddress}" $install
if ($LASTEXITCODE -ne 0) { throw 'Remote infrastructure installation failed.' }
Write-Host "Infrastructure role '$Role' deployed to $HostAddress."
