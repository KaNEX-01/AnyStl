@echo off
rem AnyStl launcher (Windows) - installs deps if needed, builds, and starts the production server.

setlocal
cd /d "%~dp0"

if "%PORT%"=="" set "PORT=3000"
set "URL=http://localhost:%PORT%"

set "REBUILD=0"
set "NO_OPEN=0"

:argloop
if "%~1"=="" goto args_done
if /I "%~1"=="--rebuild" set "REBUILD=1"
if /I "%~1"=="--no-open" set "NO_OPEN=1"
if /I "%~1"=="-h"        goto show_help
if /I "%~1"=="--help"    goto show_help
shift
goto argloop

:show_help
echo Usage: start.cmd [--rebuild] [--no-open]
echo.
echo   --rebuild   Force a fresh production build before starting.
echo   --no-open   Don't auto-open the browser.
echo.
echo Environment:
echo   PORT        Port to listen on (default: 3000).
exit /b 0

:args_done

where node >nul 2>&1
if errorlevel 1 goto ensure_node
set "NODE_MAJOR="
for /f "tokens=1 delims=v." %%v in ('node -v 2^>nul') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR goto ensure_node
if %NODE_MAJOR% LSS 20 goto ensure_node
goto node_ready

:ensure_node
echo Node.js 20+ not found on PATH. Checking or downloading official Node.js LTS...
set "NODE_BIN_FILE=%TEMP%\anystl-node-bin-%RANDOM%.txt"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-node.ps1" > "%NODE_BIN_FILE%"
set "PS_ERR=%ERRORLEVEL%"
set "NODE_BIN="
if exist "%NODE_BIN_FILE%" (
  set /p NODE_BIN=<"%NODE_BIN_FILE%"
  del /f /q "%NODE_BIN_FILE%" >nul 2>&1
)
if not "%PS_ERR%"=="0" (
  echo Automatic Node.js setup failed. Install Node.js 20+ from https://nodejs.org
  goto fail
)
if not defined NODE_BIN (
  echo Node.js 20+ is required. Install it from https://nodejs.org
  goto fail
)
if not exist "%NODE_BIN%\node.exe" (
  echo Node.js 20+ is required. Install it from https://nodejs.org
  goto fail
)
set "PATH=%NODE_BIN%;%PATH%"

:node_ready

if not exist "node_modules\next\dist\bin\next" (
  echo Installing dependencies ^(first run, ~1 min^)...
  call npm install
  if errorlevel 1 goto fail
)

if not exist "node_modules\playwright\cli.js" (
  echo Playwright missing from node_modules, reinstalling deps...
  call npm install
  if errorlevel 1 goto fail
)

if not "%ANYSTL_NO_BROWSER%"=="1" (
  echo Ensuring Playwright Chromium is installed ^(used by backend scrapers^)...
  node "node_modules\playwright\cli.js" install chromium
  if errorlevel 1 goto fail
)

if "%REBUILD%"=="1"           goto do_build
if not exist ".next\BUILD_ID" goto do_build
goto skip_build

:do_build
echo Building for production...
call npm run build
if errorlevel 1 goto fail

:skip_build
echo.
echo AnyStl is starting at %URL%
echo It will open in your default browser. Closing the tab shuts down the server.
echo Or press Ctrl+C to stop.
echo.

if "%NO_OPEN%"=="1" set "ANYSTL_NO_OPEN=1"

node "scripts\launch.mjs"
if errorlevel 1 goto fail
exit /b 0

:fail
echo.
echo AnyStl stopped with an error.
setlocal enabledelayedexpansion
echo "!CMDCMDLINE!" | find /I "/c" >nul 2>&1
if not errorlevel 1 pause
endlocal
exit /b 1
