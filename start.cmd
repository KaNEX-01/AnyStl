@echo off
rem AnyStl launcher (Windows) — installs deps if needed, builds, and starts the production server.

setlocal enabledelayedexpansion
cd /d "%~dp0"

if "%PORT%"=="" set PORT=3000
set URL=http://localhost:%PORT%

set REBUILD=0
set NO_OPEN=0

:argloop
if "%~1"=="" goto args_done
if /I "%~1"=="--rebuild" set REBUILD=1
if /I "%~1"=="--no-open" set NO_OPEN=1
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
for /f %%v in ('node -p "parseInt(process.versions.node.split('.')[0], 10)" 2^>nul') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR goto ensure_node
if %NODE_MAJOR% LSS 20 goto ensure_node
goto node_ready

:ensure_node
echo Node.js 20+ not found on PATH. Checking or downloading official Node.js LTS...
set "NODE_BIN="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-node.ps1"`) do set "NODE_BIN=%%i"
if not defined NODE_BIN (
  echo Node.js 20+ is required. Install it from https://nodejs.org
  exit /b 1
)
if not exist "%NODE_BIN%\node.exe" (
  echo Node.js 20+ is required. Install it from https://nodejs.org
  exit /b 1
)
set "PATH=%NODE_BIN%;%PATH%"

:node_ready

if not exist node_modules\.bin\next.cmd (
  echo Installing dependencies ^(first run, ~1 min^)...
  call npm install || exit /b 1
)

if not exist node_modules\.bin\playwright.cmd (
  echo Playwright missing from node_modules, reinstalling deps...
  call npm install || exit /b 1
)

if not "%ANYSTL_NO_BROWSER%"=="1" (
  echo Ensuring Playwright Chromium is installed ^(used by backend scrapers^)...
  call "node_modules\.bin\playwright.cmd" install chromium || exit /b 1
)

if "%REBUILD%"=="1"           goto do_build
if not exist .next\BUILD_ID   goto do_build
goto skip_build

:do_build
echo Building for production...
call npm run build || exit /b 1

:skip_build
echo.
echo AnyStl is starting at %URL%
echo It will open in your default browser. Closing the tab shuts down the server.
echo Or press Ctrl+C to stop.
echo.

if "%NO_OPEN%"=="1" set ANYSTL_NO_OPEN=1

call node scripts\launch.mjs
\r