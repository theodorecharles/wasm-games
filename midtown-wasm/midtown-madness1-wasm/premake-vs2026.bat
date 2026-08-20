@echo off

"tools/premake5.exe" vs2026 %*

IF %ERRORLEVEL% NEQ 0 (
    pause
)