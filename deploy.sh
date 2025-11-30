#!/bin/bash

echo "🚀 Deploying WhatsApp Bot..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install dependencies
npm install

# Create logs directory
mkdir -p logs

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "⚠️  Please edit .env file with your API keys"
    echo "📝 nano .env"
    exit 1
fi

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo "✅ Bot deployed successfully!"
echo "📊 Monitor with: pm2 monit"
echo "📋 Logs: pm2 logs whatsapp-bot"
echo "🔄 Restart: pm2 restart whatsapp-bot"