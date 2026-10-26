@echo off
rem BrickForge desktop launcher — always runs the LATEST code.
rem 1. Shuts down any previous dev instance (vite on :5173 + dev electron.exe),
rem    so a relaunch never attaches to a stale renderer.
rem 2. npm run dev rebuilds the main process, starts the UI server, opens the
rem    app, and tears everything down when the window closes.
rem Your collection data lives in %APPDATA%\brickforge and is never touched.

cd /d "%~dp0.."

rem Kill whatever holds the dev server port (a previous vite instance)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1

rem Kill leftover dev-electron processes (packaged builds run as BrickForge.exe, not electron.exe)
taskkill /IM electron.exe /F >nul 2>&1

npm run dev
