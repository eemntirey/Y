@echo off
REM Lance l'API (port 4000) et le client Vite (port 5173) en arrière-plan.
cd /d "%~dp0"
start "Y API" /min cmd /c "npm --workspace=server run dev > "%TEMP%\y-api.log" 2>&1"
start "Y Client" /min cmd /c "npm --workspace=client run dev > "%TEMP%\y-client.log" 2>&1"
echo API    -> http://localhost:4000
echo Client -> http://localhost:5173
