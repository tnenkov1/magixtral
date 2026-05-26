@echo off
title Olachra Launcher
color 0E

cd /d "%~dp0"

:: Run Magi
echo Starting FASTAPI SERVER...
start /b python main.py

:: Loading
timeout /t 5 /nobreak >nul

:: Open
echo Opening the browser...
start "" "http://localhost:8000/static/index.html"

echo ---------------------------------------------------

pause