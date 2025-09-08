#!/bin/bash

# React Log Viewer Installation Script

echo "🚀 Installing React Log Viewer..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "🔧 Creating .env file..."
    cat > .env << EOF
VITE_LOG_SERVER_URL=http://localhost:3001
VITE_APP_TITLE=React Log Viewer
EOF
    echo "✅ .env file created"
fi

echo ""
echo "🎉 React Log Viewer installed successfully!"
echo ""
echo "To start the development server:"
echo "  npm run dev"
echo ""
echo "To build for production:"
echo "  npm run build"
echo ""
echo "The app will be available at: http://localhost:3002"
echo ""
echo "Make sure your log server is running on port 3001 before starting the React app."
