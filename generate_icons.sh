#!/bin/bash
# Stop on error
set -e

echo "========================================="
echo "Generating PWA Icons for Java Visualizer"
echo "========================================="

echo "Installing sharp library for high-quality SVG rendering..."
npm install --no-save sharp

echo "Generating PWA PNG icons..."
npm run pwa-icons

echo "Success! PWA icons have been generated successfully."
echo "========================================="
