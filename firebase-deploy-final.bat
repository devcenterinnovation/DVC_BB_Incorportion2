@echo off
REM Final Firebase Deployment with Config Integration

echo 🔥 FINAL FIREBASE DEPLOYMENT
echo ===============================

echo 📋 Using Firebase Configuration:
echo Project ID: cac-api-2d773
echo App Name: CAC API
echo.

REM Copy environment files
echo 📦 Setting up environment...
copy .env.firebase .env

REM Install Firebase dependencies if needed
echo 📥 Ensuring Firebase dependencies...
npm install firebase-admin firebase-functions --save

REM Build the project
echo 🔨 Building TypeScript...
npm run build
if %errorlevel% neq 0 (
    echo ❌ Build failed!
    pause
    exit /b 1
)

echo ✅ Build successful!

echo.
echo 🚀 READY FOR DEPLOYMENT!
echo.
echo Next steps:
echo 1. Run: firebase login
echo 2. Run: firebase deploy --only functions
echo.
echo Your API will be live at:
echo https://us-central1-cac-api-2d773.cloudfunctions.net/api/v1/
echo.

pause