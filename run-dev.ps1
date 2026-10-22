Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "      TestForge Assessment Engineering Platform" -ForegroundColor Yellow
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Launching Backend REST API Server (Port 5000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd server; npm run dev"

Write-Host "[2/2] Launching Frontend Client (Port 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd client; npm run dev"

Write-Host ""
Write-Host "Both processes started in separate terminal windows:" -ForegroundColor Cyan
Write-Host "  - Frontend UI : http://localhost:5173" -ForegroundColor White
Write-Host "  - Backend API : http://localhost:5000" -ForegroundColor White
Write-Host "=========================================================" -ForegroundColor Cyan
