@echo off
setlocal
rem ============================================================
rem  PhoenixFuel - deploy: mostra le modifiche, chiede conferma,
rem  git add + commit + push (Render ricostruisce da solo).
rem  Uso:  deploy.bat            -> chiede il messaggio
rem        deploy.bat "messaggio" -> usa quello passato
rem  Non aggiunge mai file .sql o .md (restano fuori dal progetto).
rem ============================================================
cd /d "%~dp0"

echo.
echo === Modifiche rilevate ===
git status --short
echo.

set "MSG=%~1"
if "%MSG%"=="" set /p MSG=Messaggio del commit: 
if "%MSG%"=="" set "MSG=aggiornamento PhoenixFuel"

choice /C SN /M "Procedo con commit e push"
if errorlevel 2 goto :fine

git add -A -- . ":(exclude)*.sql" ":(exclude)*.md" ":(exclude)*.zip"
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo Nessun commit creato: nessuna modifica da pubblicare.
  goto :fine
)
git push
if errorlevel 1 (
  echo.
  echo *** PUSH FALLITO: controlla connessione o credenziali GitHub. ***
) else (
  echo.
  echo Pubblicato. Render aggiorna il sito in 1-2 minuti.
)

:fine
echo.
pause
endlocal
