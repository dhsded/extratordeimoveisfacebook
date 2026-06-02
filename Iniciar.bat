@echo off
title Extrator de Imoveis
cd /d "%~dp0"

echo.
echo  ========================================
echo    🏠  EXTRATOR DE IMOVEIS
echo  ========================================
echo.

if not exist "logs" mkdir logs

echo  [1/3] Iniciando backend...
start "" /B cmd /c "node src\main.js > logs\backend.log 2>&1"
timeout /t 3 /nobreak >nul

echo  [2/3] Iniciando interface...
start "" /B cmd /c "cd frontend && npx vite --port 5173 --strictPort > ..\logs\vite.log 2>&1"
timeout /t 5 /nobreak >nul

echo  [3/3] Abrindo programa...
powershell -NoProfile -Command ^
  "$psi = New-Object System.Diagnostics.ProcessStartInfo;" ^
  "$psi.FileName = '%~dp0frontend\node_modules\electron\dist\electron.exe';" ^
  "$psi.Arguments = '. --no-sandbox --disable-gpu-sandbox';" ^
  "$psi.WorkingDirectory = '%~dp0frontend';" ^
  "$psi.UseShellExecute = $false;" ^
  "[System.Diagnostics.Process]::Start($psi) | Out-Null"

echo.
echo  ✅  Pronto!
timeout /t 2 /nobreak >nul
