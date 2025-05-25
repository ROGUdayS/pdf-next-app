#!/bin/bash

# Netlify build script to handle canvas dependency conflicts
echo "Starting Netlify build process..."

# Install dependencies with legacy peer deps to resolve canvas conflicts
echo "Installing dependencies with legacy peer deps..."
npm install --legacy-peer-deps

# Run the build
echo "Running Next.js build..."
npm run build

echo "Build completed successfully!"