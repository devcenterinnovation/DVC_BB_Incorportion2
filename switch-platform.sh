#!/bin/bash
# Platform Switching Script

PLATFORM=$1

if [ -z "$PLATFORM" ]; then
    echo "Usage: ./switch-platform.sh [firebase|digitalocean]"
    echo ""
    echo "Available platforms:"
    echo "  firebase     - Deploy to Firebase Functions + Firestore"
    echo "  digitalocean - Deploy to Digital Ocean + PostgreSQL"
    exit 1
fi

case $PLATFORM in
    "firebase")
        echo "🔥 Switching to Firebase configuration..."
        cp package.firebase.json package.json
        cp .env.firebase .env
        echo "DATABASE_TYPE=firestore" >> .env
        echo "✅ Firebase configuration active"
        echo "📋 Run: npm install && npm run serve"
        ;;
    "digitalocean")
        echo "🌊 Switching to Digital Ocean configuration..."
        cp package.digitalocean.json package.json
        cp .env.digitalocean .env
        echo "DATABASE_TYPE=postgresql" >> .env
        echo "✅ Digital Ocean configuration active"
        echo "📋 Run: npm install && npm run dev"
        ;;
    *)
        echo "❌ Unknown platform: $PLATFORM"
        echo "Available platforms: firebase, digitalocean"
        exit 1
        ;;
esac