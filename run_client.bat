@echo off
echo Starting Frontend Client...
cd client
"C:\Program Files\nodejs\npm.cmd" run dev
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Could not find npm.cmd at "C:\Program Files\nodejs\npm.cmd"
    echo Please make sure Node.js is installed.
    pause
)
pause
