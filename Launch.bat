@echo off
setlocal EnableExtensions
title mAI Spot
cd /d "%~dp0"
set "ROOT=%~dp0"
set "NODE_VER=v22.12.0"
set "NODE_DIR=%ROOT%runtime\node"

echo.
echo  ===================================================================
echo                              mAI  SPOT
echo     Radio . Cinema . Pictures . Arcade . Library . Friends (P2P)
echo  ===================================================================
echo    Launch.bat        start your Spot
echo    Launch.bat dev    developer mode (hot reload)
echo  ===================================================================
echo.

rem Everything stays inside this folder: Node.js, packages, npm's cache, your data.
set "npm_config_cache=%ROOT%runtime\npm-cache"
set "npm_config_update_notifier=false"
set "npm_config_fund=false"

rem 1. Use this folder's own Node.js if it has one.
if exist "%NODE_DIR%\node.exe" goto use_private

rem 2. Otherwise a recent enough Node.js on this PC.
where node >nul 2>nul
if errorlevel 1 goto get_node
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>18||(a===18&&b>=18)?0:1)"
if errorlevel 1 goto get_node
goto have_node

:get_node
rem 3. Neither: fetch a private copy into runtime\node (one time, about 30 MB).
echo [setup] Downloading Node.js %NODE_VER% into runtime\node (one time, about 30 MB)...
if not exist "%ROOT%runtime" mkdir "%ROOT%runtime"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; $z='%ROOT%runtime\node.zip'; Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/%NODE_VER%/node-%NODE_VER%-win-x64.zip' -OutFile $z; Expand-Archive -Force $z '%ROOT%runtime'; if (Test-Path '%NODE_DIR%') { Remove-Item -Recurse -Force '%NODE_DIR%' }; Rename-Item '%ROOT%runtime\node-%NODE_VER%-win-x64' 'node'; Remove-Item $z"
if not exist "%NODE_DIR%\node.exe" (
    echo [ERROR] Couldn't download Node.js. Check your internet connection, or install Node.js 18.18+ from https://nodejs.org/
    pause
    exit /b 1
)

:use_private
set "PATH=%NODE_DIR%;%PATH%"

:have_node
for /f "delims=" %%v in ('node -v') do echo [setup] Using Node.js %%v

set MODE=
if /i "%~1"=="dev" set MODE=--dev
if not defined PORT set PORT=8088

node scripts\preflight.mjs %MODE%
if errorlevel 1 (
    pause
    exit /b 1
)

echo.
echo   Your Spot opens at http://localhost:%PORT% in a few seconds.
echo   Keep this window open: your Spot (and your radio) runs while it's open.
echo   Press CTRL+C here to stop.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:%PORT%'"

node server.mjs %MODE%
pause
