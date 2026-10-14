@echo off
rem AURA CRM: stops the background server and the Cloudflare tunnel.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3333 .*LISTENING"') do taskkill /PID %%p /F >nul 2>&1
taskkill /IM cloudflared.exe /F >nul 2>&1
echo AURA CRM server stopped. Run start.bat to start it again.
timeout /t 3 >nul
