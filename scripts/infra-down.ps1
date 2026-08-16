param([ValidateSet('main', 'judge', 'all')] [string] $Role = 'all')

. (Join-Path $PSScriptRoot 'infra-common.ps1')
Assert-DockerReady
Invoke-InfraCompose -Role $Role stop
Write-Host 'Services are stopped. Volumes and data were preserved.'
