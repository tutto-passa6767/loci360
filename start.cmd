@echo off
rem Double-click to start LOCI360: Docker, database, media worker, API and the site; the browser opens when it is ready.
chcp 65001 >nul
cd /d "%~dp0"
title LOCI360
where node >nul 2>nul || (
  echo Нужен Node.js 22 или новее: https://nodejs.org
  pause
  exit /b 1
)
node scripts\start.mjs --open
if errorlevel 1 pause
