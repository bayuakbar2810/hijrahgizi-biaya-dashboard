@echo off
REM ============================================================
REM  Hijrah Gizihew — Dashboard Analisis Biaya Produksi
REM  Jalankan service Python & aplikasi web sekaligus
REM ============================================================
cd /d "%~dp0"

if not exist node_modules (
    echo Menginstal dependensi web (pertama kali, mohon tunggu)...
    call npm install
)

echo [1/2] Memulai service analisis Python (port 8000)...
start "Python Service (8000)" cmd /k "cd /d %~dp0py-service && pip install -r requirements.txt && python -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo [2/2] Memulai aplikasi web Next.js (http://localhost:3000)...
start "" http://localhost:3000
call npm run dev