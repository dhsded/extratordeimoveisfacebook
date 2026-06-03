@echo off
chcp 65001 >nul
title Extrator de Imóveis — Iniciando...
cd /d "%~dp0"

echo.
echo  ==========================================
echo    🏠  EXTRATOR DE IMÓVEIS  v1.0
echo  ==========================================
echo.

:: Mata instâncias anteriores
taskkill /F /IM electron.exe /T >nul 2>&1
timeout /t 1 /nobreak >nul

:: Cria pasta de logs
if not exist "logs" mkdir logs

:: ── 1. Backend (porta 3001) ───────────────────────────────────────
echo  [1/3] Iniciando backend...
start "" /B cmd /c "node src\main.js > logs\backend.log 2>&1"

:: Aguarda o backend subir
timeout /t 4 /nobreak >nul
curl -s http://localhost:3001/api/health >nul 2>&1
if errorlevel 1 (
    echo  [!] Backend ainda carregando, aguardando...
    timeout /t 3 /nobreak >nul
)

:: ── 2. Vite (porta 5173) ─────────────────────────────────────────
echo  [2/3] Iniciando interface...
start "" /B cmd /c "cd frontend && npx vite --port 5173 > ..\logs\vite.log 2>&1"
timeout /t 5 /nobreak >nul

:: ── 3. Electron ──────────────────────────────────────────────────
echo  [3/3] Abrindo programa...
start "" "frontend\node_modules\electron\dist\electron.exe" "frontend" --no-sandbox --disable-gpu-sandbox

echo.
echo  ✅ Programa iniciado! Verifique a barra de tarefas.
echo.
timeout /t 3 /nobreak >nul
exit
