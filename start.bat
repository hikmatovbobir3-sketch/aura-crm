@echo off
chcp 65001 > nul
title AURA CRM Server (Cloudflare Tunnel)
cd /d "C:\Users\user\Desktop\AURA_Outreach"
echo ========================================================
echo   Zapusk servera AURA CRM...
echo   Sayt otkroetsya v brauzere: http://localhost:3000
echo   Vse izmeneniya budut avtomaticheski soxranyatsya na disk!
echo ========================================================
start "" "http://localhost:3000"
python server.py
pause
