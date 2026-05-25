# AI 接口测试脚本（PowerShell）
# 用法：powershell -File scripts/test-ai.ps1

$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3000/api/v1/ai'

Write-Host "`n========== 1. Health Check ==========" -ForegroundColor Cyan
try {
  $health = Invoke-RestMethod -Uri "$base/health" -Method GET
  $health | ConvertTo-Json -Depth 5
} catch {
  Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n========== 2. Parse Command ==========" -ForegroundColor Cyan
$body = @{
  command = '去@elonmusk点赞前5条推文后暂停'
} | ConvertTo-Json -Compress

Write-Host "Request body: $body" -ForegroundColor Gray
try {
  $result = Invoke-RestMethod `
    -Uri "$base/parse-command" `
    -Method POST `
    -Body $body `
    -ContentType 'application/json; charset=utf-8'
  $result | ConvertTo-Json -Depth 10
} catch {
  Write-Host "Error: $_" -ForegroundColor Red
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host "Response: $($reader.ReadToEnd())" -ForegroundColor Yellow
  }
}

Write-Host "`n========== 3. Generate Comment ==========" -ForegroundColor Cyan
$body2 = @{
  text = '刚发布了新功能，超开心！'
} | ConvertTo-Json -Compress

Write-Host "Request body: $body2" -ForegroundColor Gray
try {
  $result2 = Invoke-RestMethod `
    -Uri "$base/generate-comment" `
    -Method POST `
    -Body $body2 `
    -ContentType 'application/json; charset=utf-8'
  $result2 | ConvertTo-Json -Depth 10
} catch {
  Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n========== Done ==========" -ForegroundColor Green