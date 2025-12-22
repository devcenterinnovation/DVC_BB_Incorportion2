@echo off
REM Firebase Deployment Script for Windows

echo 🔥 Setting up Firebase for deployment...

REM Step 1: Check if Firebase CLI is installed
firebase --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 📦 Installing Firebase CLI...
    npm install -g firebase-tools
)

REM Step 2: Copy Firebase configuration
echo 📋 Copying Firebase configuration...
copy package.firebase-temp.json package.json
copy .env.firebase .env

REM Step 3: Install dependencies
echo 📥 Installing Firebase dependencies...
npm install

REM Step 4: Add Firebase specific dependencies
echo 🔧 Adding Firebase Functions dependencies...
npm install firebase-admin firebase-functions bcrypt

REM Step 5: Build the project
echo 🔨 Building TypeScript...
npm run build

REM Step 6: Check if Firebase is initialized
if not exist firebase.json (
    echo ⚠️  Firebase not initialized. Please run:
    echo    firebase login
    echo    firebase init
    echo    Then run this script again.
    pause
    exit /b 1
)

echo ✅ Firebase setup complete!
echo.
echo 🚀 Next steps:
echo 1. Update .firebaserc with your project ID
echo 2. Add your environment variables to .env  
echo 3. Run: npm run serve (for local testing)
echo 4. Run: npm run deploy (for production deployment)
pause