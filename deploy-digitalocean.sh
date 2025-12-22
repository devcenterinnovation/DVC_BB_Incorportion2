#!/bin/bash
# Digital Ocean Deployment Script

echo "🌊 Preparing for Digital Ocean deployment..."

# Copy Digital Ocean-specific files
echo "📦 Setting up Digital Ocean configuration..."
cp package.digitalocean.json package.json
cp .env.digitalocean .env

# Create Dockerfile for Digital Ocean
cat > Dockerfile << EOF
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy built application
COPY dist/ ./dist/

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
EOF

# Create .dockerignore
cat > .dockerignore << EOF
node_modules
.git
.env
*.md
.gitignore
src/
*.ts
tsconfig.json
firebase.json
firestore.rules
firestore.indexes.json
EOF

# Build the project
echo "🔨 Building TypeScript..."
npm run build

echo "✅ Digital Ocean setup complete!"
echo "📋 Next steps:"
echo "   1. Push this code to your Git repository"
echo "   2. Connect your repo to Digital Ocean App Platform"
echo "   3. Set environment variables in DO dashboard"
echo "   4. Deploy from DO App Platform console"
echo ""
echo "🔑 Required environment variables for Digital Ocean:"
echo "   DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY, etc."