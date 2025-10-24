#!/bin/bash
set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Logistics Management System - Deployment Script          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install it first."
    exit 1
fi

# Pull latest changes
echo "📥 Pulling latest changes from Git..."
git pull origin main

# Copy .env.example to .env if not exists
if [ ! -f .env ]; then
    echo "📋 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration before continuing"
    echo "Press Enter when ready..."
    read
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Build new images
echo "🔨 Building Docker images..."
docker-compose build --no-cache

# Start containers
echo "🚀 Starting containers..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Show status
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Deployment Status                                         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
docker-compose ps

echo ""
echo "📊 Recent logs:"
docker-compose logs --tail=30 app

echo ""
echo "✅ Deployment completed successfully!"
echo "🌐 Application is running at http://localhost:80"
echo ""
echo "Useful commands:"
echo "  - View logs:        docker-compose logs -f"
echo "  - Restart:          docker-compose restart"
echo "  - Stop:             docker-compose down"
echo "  - Rebuild:          docker-compose build && docker-compose up -d"