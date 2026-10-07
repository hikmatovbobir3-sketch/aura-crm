@echo off
chcp 65001 >nul
echo ========================================================
echo       AURA CRM - Otpravka obnovleniy na GitHub
echo ========================================================
echo.

set "PATH=%PATH%;C:\Users\user\AppData\Local\Programs\Git\cmd"

cd /d "C:\Users\user\Desktop\AURA_Outreach"

echo [1/3] Proverka izmeneniy...
git status --short
echo.

set /p commit_msg="Vvedite opisanie (Enter dlya 'Update'): "
if "%commit_msg%"=="" set commit_msg=Update CRM database and state

echo.
echo [2/3] Fiksaciya izmeneniy...
git add .
git commit -m "%commit_msg%"

echo.
echo [3/3] Otpravka na GitHub (git push)...
git push

echo.
if %ERRORLEVEL% equ 0 (
    echo [OK] Uspeshno otpravleno na GitHub!
) else (
    echo [!] Proverte ssylku na repozitoriy ili avtorizaciyu.
)

echo.
pause
