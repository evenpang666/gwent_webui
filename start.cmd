@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title White Orchard Gwent
pushd "%~dp0"
if errorlevel 1 goto directory_error

where.exe node >nul 2>nul
if errorlevel 1 goto node_error
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 goto version_error
if not exist "%~dp0server.cjs" goto files_error

echo Starting White Orchard Gwent...
echo Keep this window open while playing. Press Ctrl+C to stop the server.
echo.
node "%~dp0server.cjs" --open
set "GWENT_EXIT_CODE=%errorlevel%"
if not "%GWENT_EXIT_CODE%"=="0" echo [ERROR] The game server failed to start. See the error above.
goto finish

:node_error
echo [ERROR] Node.js was not found. Install Node.js 18 or newer, then reopen this launcher.
set "GWENT_EXIT_CODE=1"
goto finish

:version_error
echo [ERROR] Node.js 18 or newer is required. Upgrade Node.js, then reopen this launcher.
set "GWENT_EXIT_CODE=1"
goto finish

:files_error
echo [ERROR] server.cjs is missing. Extract the complete project before launching.
set "GWENT_EXIT_CODE=1"
goto finish

:directory_error
echo [ERROR] Cannot open the game directory. Check its location and access permissions.
echo.
pause
exit /b 1

:finish
echo.
echo Press any key to close this window...
pause >nul
popd
exit /b %GWENT_EXIT_CODE%
