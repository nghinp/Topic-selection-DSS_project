@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%temp-title-quality-test.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo Title quality test finished with no warnings or errors.
) else (
  echo Title quality test found issues. Check the console output and JSON report for details.
)

exit /b %EXIT_CODE%
