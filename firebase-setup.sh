#!/bin/bash
# Firebase Setup and Deployment Script

echo "🔥 Setting up Firebase for deployment..."

# Step 1: Install Firebase CLI if not already installed
if ! command -v firebase &> /dev/null; then
    echo "📦 Installing Firebase CLI..."
    npm install -g firebase-tools
fi

# Step 2: Copy Firebase configuration
echo "📋 Copying Firebase configuration..."
cp package.firebase-temp.json package.json
cp .env.firebase .env

# Step 3: Install dependencies
echo "📥 Installing Firebase dependencies..."
npm install

# Step 4: Add Firebase specific dependencies
echo "🔧 Adding Firebase Functions dependencies..."
npm install firebase-admin firebase-functions

# Step 5: Build the project
echo "🔨 Building TypeScript..."
npm run build

# Step 6: Initialize Firebase (if needed)
if [ ! -f "firebase.json" ]; then
    echo "⚠️  Firebase not initialized. Please run:"
    echo "   firebase login"
    echo "   firebase init"
    echo "   Then run this script again."
    exit 1
fi

echo "✅ Firebase setup complete!"
echo ""
echo "🚀 Next steps:"
echo "1. Update .firebaserc with your project ID"
echo "2. Add your environment variables to .env"
echo "3. Run: npm run serve (for local testing)"
echo "4. Run: npm run deploy (for production deployment)"