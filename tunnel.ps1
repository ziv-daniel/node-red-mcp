Write-Host "Starting localtunnel for port 3000..." -ForegroundColor Green

# Start localtunnel and capture output
$process = Start-Process -FilePath "lt" -ArgumentList "--port", "3000" -PassThru -RedirectStandardOutput "tunnel-output.txt" -NoNewWindow

# Wait a moment for tunnel to establish
Start-Sleep -Seconds 3

# Read the output to get the URL
if (Test-Path "tunnel-output.txt") {
    $output = Get-Content "tunnel-output.txt" -Raw
    if ($output -match "https://[a-zA-Z0-9-]+\.loca\.lt") {
        $tunnelUrl = $matches[0]
        Write-Host "🌐 Public tunnel URL: $tunnelUrl" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "For Claude website integration, use:" -ForegroundColor Yellow
        Write-Host "URL: $tunnelUrl/api/events" -ForegroundColor White
        Write-Host ""
        Write-Host "Test the tunnel:" -ForegroundColor Yellow
        Write-Host "curl $tunnelUrl/ping" -ForegroundColor White
        
        # Test the tunnel
        try {
            $response = Invoke-RestMethod -Uri "$tunnelUrl/ping" -Method Get
            Write-Host "✅ Tunnel is working! Response: $response" -ForegroundColor Green
        } catch {
            Write-Host "❌ Tunnel test failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "Could not extract tunnel URL from output:" -ForegroundColor Red
        Write-Host $output
    }
}

Write-Host ""
Write-Host "Press Ctrl+C to stop the tunnel" -ForegroundColor Gray
try {
    Wait-Process -Id $process.Id
} catch {
    Write-Host "Tunnel stopped." -ForegroundColor Yellow
} 