. (Join-Path $PSScriptRoot 'infra-common.ps1')
$values = Read-InfraEnv
$headers = @{ $values.JUDGE0_AUTH_HEADER = $values.JUDGE0_AUTH_TOKEN }
$body = @{
  source_code = @'
#include <iostream>
int main() { long long a, b; std::cin >> a >> b; std::cout << a + b << '\n'; }
'@
  language_id = 54
  stdin = '2 3'
  expected_output = '5'
  cpu_time_limit = 2
  memory_limit = 131072
} | ConvertTo-Json
$uri = "http://127.0.0.1:$($values.JUDGE0_PORT)/submissions?base64_encoded=false&wait=true"
$result = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30
if ($result.status.description -ne 'Accepted') {
  $safeMessage = if ($result.message) { [string]$result.message } else { 'No diagnostic message returned.' }
  throw "Judge0 smoke test failed with status '$($result.status.description)': $safeMessage"
}
Write-Host "Judge0 real execution passed: $($result.status.description), time=$($result.time)s, memory=$($result.memory)KB"
