#!/bin/bash
set -e

echo "🧹 Cleaning caches (fast mode - keeping node_modules)..."

# Remove Next.js cache
rm -rf .next

# Remove TypeScript cache
rm -rf tsconfig.tsbuildinfo

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
