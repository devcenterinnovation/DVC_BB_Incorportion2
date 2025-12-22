#!/bin/bash
# Firebase Deployment Script

echo "🚀 Deploying to Firebase..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

# Copy Firebase-specific files
echo "📦 Setting up Firebase configuration..."
cp package.firebase.json package.json
cp .env.firebase .env

# Install dependencies
echo "📥 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building TypeScript..."
npm run build

# Deploy to Firebase
echo "☁️ Deploying to Firebase..."
firebase deploy

echo "✅ Firebase deployment complete!"
echo "📊 Your API is available at:"
echo "   https://your-project-id.cloudfunctions.net/api"
echo "   Admin: https://your-project-id.cloudfunctions.net/api/v1/admin/auth/login"