#!/bin/bash

# Alternative Netlify build script for React 19 compatibility
set -e  # Exit on any error

echo "Starting alternative Netlify build process..."
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Set Node.js version explicitly
export NODE_VERSION=20.11.0

# Set environment variables for canvas compilation
export CANVAS_PREBUILT=false
export PYTHON=/opt/buildhome/.local/share/mise/installs/python/3.13.3/bin/python3

# Clear npm cache
echo "Clearing npm cache..."
npm cache clean --force

# Remove node_modules and package-lock.json for a clean install
echo "Removing existing node_modules and package-lock.json..."
rm -rf node_modules package-lock.json

# Try installing with different strategies
echo "Attempting installation with --legacy-peer-deps first..."
if npm install --legacy-peer-deps; then
    echo "Installation successful with --legacy-peer-deps"
elif npm install --force; then
    echo "Installation successful with --force"
else
    echo "Both installation methods failed, trying without canvas..."
    # Temporarily remove canvas from package.json and try again
    cp package.json package.json.backup
    npm uninstall canvas --no-save
    if npm install --force; then
        echo "Installed without canvas, build may have limited PDF functionality"
        # Restore package.json but continue without canvas
        cp package.json.backup package.json
    else
        echo "All installation methods failed"
        exit 1
    fi
fi

# Run the build
echo "Running Next.js build..."
npm run build

echo "Build completed!" 