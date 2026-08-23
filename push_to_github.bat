@echo off
set /p REPO_URL="Enter your GitHub repository URL (e.g. https://github.com/username/pilot.git): "
if "%REPO_URL%"=="" (
    echo No URL entered. Exiting.
    pause
    exit /b
)
git remote remove origin >nul 2>&1
git remote add origin %REPO_URL%
git branch -M main
git push -u origin main
echo.
echo Done!
pause
