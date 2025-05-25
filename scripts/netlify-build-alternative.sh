#!/bin/bash

# Alternative Netlify build script for React 19 compatibility
echo "Starting alternative Netlify build process..."

# Set Node.js version
export NODE_VERSION=20

# Set environment variables for canvas compilation
export CANVAS_PREBUILT=false
export PYTHON=/opt/buildhome/.local/share/mise/installs/python/3.13.3/bin/python3

# Clear npm cache
echo "Clearing npm cache..."
npm cache clean --force

# Try installing with different strategies
echo "Attempting installation with --legacy-peer-deps first..."
if npm install --legacy-peer-deps; then
    echo "Installation successful with --legacy-peer-deps"
else
    echo "Installation with --legacy-peer-deps failed, trying --force..."
    if npm install --force; then
        echo "Installation successful with --force"
    else
        echo "Both installation methods failed, trying without canvas..."
        # Remove canvas temporarily and try again
        npm uninstall canvas
        npm install --force
        echo "Installed without canvas, build may have limited PDF functionality"
    fi
fi

# Run the build
echo "Running Next.js build..."
npm run build

echo "Build completed!" 