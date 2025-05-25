#!/bin/bash

# Netlify build script to handle React 19 and canvas dependency conflicts
set -e  # Exit on any error

echo "Starting Netlify build process..."
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Set environment variables for canvas compilation
export CANVAS_PREBUILT=false
export PYTHON=/opt/buildhome/.local/share/mise/installs/python/3.13.3/bin/python3

# Clear npm cache to avoid potential issues
echo "Clearing npm cache..."
npm cache clean --force

# Install dependencies with force flag to resolve React 19 peer dependency issues
echo "Installing dependencies with --force flag to resolve React 19 peer dependencies..."
if npm install --force; then
    echo "Dependencies installed successfully"
else
    echo "npm install --force failed, trying with --legacy-peer-deps..."
    npm install --legacy-peer-deps
fi

# Run the build
echo "Running Next.js build..."
npm run build

echo "Build completed successfully!"