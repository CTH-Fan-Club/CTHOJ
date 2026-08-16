param(
  [switch] $InstallDockerDesktop,
  [switch] $EnableHyperVForJudge0
)

$ErrorActionPreference = 'Stop'
$processor = Get-CimInstance Win32_Processor | Select-Object -First 1
$computer = Get-CimInstance Win32_ComputerSystem
if (-not $processor.VirtualizationFirmwareEnabled -and -not $computer.HypervisorPresent) {
  throw 'Enable Intel Virtualization Technology (VT-x) in BIOS/UEFI, save, and reboot Windows before continuing.'
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run PowerShell as Administrator.' }

Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart | Out-Null
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart | Out-Null
if ($EnableHyperVForJudge0) {
  Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All -NoRestart | Out-Null
}

if ($InstallDockerDesktop -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
  & winget install --id Docker.DockerDesktop --exact --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop installation failed.' }
}

Write-Host 'Windows container prerequisites are enabled. Reboot, start Docker Desktop, then run: .\scripts\infra-up.ps1 -Role all'
