@echo off
rem AURA CRM: starts the server in the background (if it is not running yet) and opens the site.
rem Normally the server already starts by itself when Windows starts.
cd /d "%~dp0"
netstat -ano | findstr /R /C:":3333 .*LISTENING" >nul
if errorlevel 1 (
    start "" pythonw "%~dp0server.py"
    timeout /t 2 /nobreak >nul
)
start "" "http://localhost:3333"
