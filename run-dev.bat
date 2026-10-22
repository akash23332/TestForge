@echo off
title TestForge Platform Launcher
echo =========================================================
echo       TestForge Assessment Engineering Platform
echo =========================================================
echo.

echo [1/2] Launching Backend REST API Server (Port 5000)...
start "TestForge API Server" cmd /k "cd server && npm run dev"

echo [2/2] Launching Frontend Client (Port 5173)...
start "TestForge Frontend Client" cmd /k "cd client && npm run dev"

echo.
echo Both servers are starting up!
echo   - Frontend: http://localhost:5173
echo   - Backend:  http://localhost:5000
echo.
echo =========================================================
