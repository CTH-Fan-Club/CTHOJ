param([switch] $SkipDockerCheck)

. (Join-Path $PSScriptRoot 'infra-common.ps1')

function New-HexSecret {
  param([int] $Bytes = 32)
  $buffer = [byte[]]::new($Bytes)
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
  return ([BitConverter]::ToString($buffer) -replace '-', '').ToLowerInvariant()
}

$root = Get-ProjectRoot
$infra = Join-Path $root 'infra'
$example = Join-Path $infra '.env.infrastructure.example'
$envPath = Get-InfraEnvPath
$runtime = Join-Path $infra 'runtime'

if (-not $SkipDockerCheck) {
  $processor = Get-CimInstance Win32_Processor | Select-Object -First 1
  $computer = Get-CimInstance Win32_ComputerSystem
  if (-not $processor.VirtualizationFirmwareEnabled -and -not $computer.HypervisorPresent) {
    throw 'CPU virtualization is disabled in BIOS/UEFI. Enable Intel VT-x or AMD-V before starting Judge0.'
  }
  Assert-DockerReady
}

New-Item -ItemType Directory -Force -Path $runtime | Out-Null
if (-not (Test-Path -LiteralPath $envPath)) {
  $content = Get-Content -Raw -LiteralPath $example
  $content = [regex]::Replace($content, '__GENERATE_HEX_32__', { param($match) New-HexSecret })
  [System.IO.File]::WriteAllText($envPath, $content, [System.Text.UTF8Encoding]::new($false))
}

$values = Read-InfraEnv
$templatePath = Join-Path $infra 'judge0.conf.template'
$rendered = Get-Content -Raw -LiteralPath $templatePath
$rendered = [regex]::Replace($rendered, '\$\{([A-Z0-9_]+)\}', {
  param($match)
  $key = $match.Groups[1].Value
  if (-not $values.ContainsKey($key)) { throw "Missing infrastructure variable: $key" }
  return [string]$values[$key]
})
$judgeConfig = Join-Path $runtime 'judge0.conf'
[System.IO.File]::WriteAllText($judgeConfig, $rendered, [System.Text.UTF8Encoding]::new($false))

Write-Host "Infrastructure configuration is ready: $envPath"
Write-Host "Judge0 runtime configuration is ready: $judgeConfig"
