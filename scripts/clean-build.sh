#!/bin/bash
set -e

echo "🧹 Cleaning all caches and build artifacts..."

# Remove Next.js cache
rm -rf .next

# Remove TypeScript cache
rm -rf tsconfig.tsbuildinfo

# Remove node_modules and lockfile (optional but most thorough)
echo "📦 Removing node_modules..."
rm -rf node_modules

# Reinstall dependencies
echo "📥 Reinstalling dependencies..."
npm ci

# Run TypeScript check
echo "🔍 Running TypeScript check..."
npx tsc --noEmit

# Run linting
echo "🔧 Running linting..."
npm run lint

# Run build
echo "🏗️  Running production build..."
npm run build

echo "✅ Clean build completed successfully!"
