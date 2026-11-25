@echo off
setlocal
cd /d "%~dp0"
echo SLIDE CULT - Cloudflare Multiplayer Deployment
echo.
where node >nul 2>nul || (echo Node.js is required. Install Node.js LTS first. & pause & exit /b 1)
echo Installing deployment tools...
npm install || (echo npm install failed. & pause & exit /b 1)
echo.
echo A browser window will open for Cloudflare login.
npx wrangler login || (echo Cloudflare login failed. & pause & exit /b 1)
echo.
npx wrangler deploy
echo.
echo Copy the workers.dev URL printed above into the game's Multiplayer menu.
pause
