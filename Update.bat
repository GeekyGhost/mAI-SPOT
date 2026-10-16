@echo off
setlocal EnableExtensions
title Update mAI Spot
cd /d "%~dp0"
if exist "runtime\node\node.exe" set "PATH=%CD%\runtime\node;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Run Launch.bat once to set up Node.js, then close the Spot and run this updater.
  pause
  exit /b 1
)
rem Parse the whole block before updating: the updater may replace this batch file.
(
  node scripts\update.mjs %*
  if errorlevel 1 (
    echo Update did not complete. Read the message above before trying again.
    pause
    exit /b 1
  )
  pause
  exit /b 0
)
