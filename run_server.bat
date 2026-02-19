@echo off
echo Starting Backend Server...
cd server
"C:\Program Files\nodejs\node.exe" index.js
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Could not find node.exe at "C:\Program Files\nodejs\node.exe"
    echo Please make sure Node.js is installed.
    pause
)
pause
