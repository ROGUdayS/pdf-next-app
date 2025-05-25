#!/bin/bash

# Netlify build script to handle React 19 and canvas dependency conflicts
echo "Starting Netlify build process..."

# Set environment variables for canvas compilation
export CANVAS_PREBUILT=false
export PYTHON=/opt/buildhome/.local/share/mise/installs/python/3.13.3/bin/python3

# Install dependencies with force flag to resolve React 19 peer dependency issues
echo "Installing dependencies with --force flag to resolve React 19 peer dependencies..."
npm install --force

# Run the build
echo "Running Next.js build..."
npm run build

echo "Build completed successfully!"