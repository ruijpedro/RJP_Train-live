@echo off
title RJP Train Live V2.1
echo =====================================
echo       RJP TRAIN LIVE V2.1
echo =====================================
echo.
where docker >nul 2>nul
if %errorlevel%==0 (
  echo [1/2] A iniciar backend CP/IP...
  start "RJP BACKEND" cmd /k docker compose up
) else (
  echo Docker nao encontrado. A iniciar apenas o backend Node...
  start "RJP API" cmd /k npm run server
)
timeout /t 4 >nul
echo [2/2] A iniciar WebApp...
start "RJP WEB" cmd /k npm run dev
timeout /t 3 >nul
start http://localhost:5173
