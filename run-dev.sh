#!/usr/bin/env bash
echo "========================================================="
echo "      TestForge Assessment Engineering Platform"
echo "========================================================="
echo ""

echo "[1/2] Starting Backend REST API Server (Port 5000)..."
(cd server && npm run dev) &
SERVER_PID=$!

echo "[2/2] Starting Frontend Client (Port 5173)..."
(cd client && npm run dev) &
CLIENT_PID=$!

trap "kill $SERVER_PID $CLIENT_PID" EXIT

echo ""
echo "Both processes running in background:"
echo "  - Frontend UI : http://localhost:5173"
echo "  - Backend API : http://localhost:5000"
echo "Press Ctrl+C to terminate both servers."
wait
