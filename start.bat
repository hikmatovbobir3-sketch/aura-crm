@echo off
chcp 65001 > nul
title AURA CRM Server (Cloudflare Tunnel)
cd /d "C:\Users\user\Desktop\AURA_Outreach"
echo ========================================================
echo   Zapusk servera AURA CRM i Cloudflare Tunnel...
echo   Ne zakryvayte eto okno, poka rabotaet sayt!
echo ========================================================
python server.py
pause
