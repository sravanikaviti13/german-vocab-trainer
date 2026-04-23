@echo off
start "Backend" cmd /k "cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8000 --host 0.0.0.0"
timeout /t 3
start "Frontend" cmd /k "cd frontend && npm run dev"
timeout /t 3
start "Backend Tunnel" cmd /k "cloudflared tunnel --url http://localhost:8000"
timeout /t 2
start "Frontend Tunnel" cmd /k "cloudflared tunnel --url http://localhost:5173"
echo Started all 4 services. Check each window.