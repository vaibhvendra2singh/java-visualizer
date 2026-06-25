#!/bin/bash

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║        🚀  Visualizer Runner         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌  Node.js is not installed. Please install it from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v)
echo "✅  Node.js $NODE_VERSION found"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo ""
  echo "📦  Installing dependencies..."
  npm install
else
  echo "✅  Dependencies already installed"
fi

# Start dev server
echo ""
echo "🌐  Starting development server..."
echo "──────────────────────────────────────────"
npm run dev
