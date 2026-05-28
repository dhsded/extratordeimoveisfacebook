@echo off
title Extrator de Imoveis
cd /d "%~dp0"

echo.
echo  ========================================
echo    🏠  EXTRATOR DE IMOVEIS
echo  ========================================
echo.

:: Cria pasta de logs
if not exist "logs" mkdir logs

:: Inicia backend (porta 3001)
echo  [1/3] Iniciando backend...
start "" /B cmd /c "node src\main.js > logs\backend.log 2>&1"
timeout /t 3 /nobreak >nul

:: Inicia Vite (porta 5173)
echo  [2/3] Iniciando interface...
start "" /B cmd /c "cd frontend && npx vite --port 5173 --strictPort > ..\logs\vite.log 2>&1"
timeout /t 5 /nobreak >nul

:: Abre como app no Edge ou Chrome (modo sem barra de enderecos = parece app)
echo  [3/3] Abrindo programa...
set URL=http://localhost:5173

:: Tenta Edge primeiro
set EDGE="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist %EDGE% (
    start "" %EDGE% --app=%URL% --window-size=1400,860 --disable-extensions
    goto :fim
)

:: Tenta Chrome
set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist %CHROME% (
    start "" %CHROME% --app=%URL% --window-size=1400,860 --disable-extensions
    goto :fim
)

set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist %CHROME% (
    start "" %CHROME% --app=%URL% --window-size=1400,860 --disable-extensions
    goto :fim
)

:: Fallback: abre no Electron
echo  Abrindo no Electron...
powershell -NoProfile -Command ^
  "$psi = New-Object System.Diagnostics.ProcessStartInfo;" ^
  "$psi.FileName = '%~dp0frontend\node_modules\electron\dist\electron.exe';" ^
  "$psi.Arguments = '. --no-sandbox';" ^
  "$psi.WorkingDirectory = '%~dp0frontend';" ^
  "$psi.UseShellExecute = $false;" ^
  "[System.Diagnostics.Process]::Start($psi) | Out-Null"

:fim
echo.
echo  ✅  Pronto! O programa foi aberto.
echo.
timeout /t 3 /nobreak >nul
