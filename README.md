# WhatsApp Hinglish Bot 🤖

A natural Hinglish WhatsApp bot with conversation analysis and AI responses.

## Features ✨

- **Natural Hinglish Conversations** - Talks like a real desi friend
- **Conversation Analysis** - Analyzes chat patterns and topics
- **Stop Command** - `stop.bot` pauses bot for 15 minutes
- **Message History** - Tracks conversation context
- **Offline Mode** - Works with trained responses when API is down
- **Multiple Tones** - Hinglish, friendly, anime, educational

## Quick Start 🚀

### Local Development

1. **Clone & Install**
```bash
git clone <your-repo>
cd project_bot
npm install
```

2. **Setup Environment**
```bash
cp .env.example .env
# Edit .env with your OpenRouter API key
```

3. **Run Bot**
```bash
npm start
```

### Server Deployment

#### Option 1: Linux Server with PM2
```bash
chmod +x deploy.sh
./deploy.sh
```

#### Option 2: Docker
```bash
docker build -t whatsapp-bot .
docker run -d --name whatsapp-bot -v $(pwd)/.env:/app/.env whatsapp-bot
```

#### Option 3: Manual Server Setup
```bash
# Install dependencies
npm install --production

# Start with PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Environment Variables 🔧

```env
OPENROUTER_API_KEY=your_api_key_here
MODEL=meta-llama/llama-3.1-8b-instruct:free
BOT_TONE=hinglish
OFFLINE_MODE=false
```

## Commands 💬

- **Analysis**: "analyze", "previous message", "chat history"
- **Stop Bot**: `stop.bot` (pauses for 15 minutes)
- **General Chat**: Just talk naturally in Hinglish!

## Server Requirements 📋

- **Node.js**: 16+ 
- **RAM**: 512MB minimum, 1GB recommended
- **Storage**: 1GB for logs and session data
- **Network**: Stable internet for WhatsApp Web

## Popular Hosting Options 🌐

1. **DigitalOcean Droplet** ($5/month)
2. **AWS EC2 t2.micro** (Free tier)
3. **Heroku** (Free/Paid)
4. **Railway** (Free tier)
5. **VPS providers** (Hostinger, Vultr, etc.)

## Monitoring 📊

```bash
# View logs
pm2 logs whatsapp-bot

# Monitor performance
pm2 monit

# Restart bot
pm2 restart whatsapp-bot
```

## Troubleshooting 🔧

**QR Code Issues**: Make sure server has display capabilities or use headless mode
**Memory Issues**: Restart with `pm2 restart whatsapp-bot`
**API Errors**: Check OpenRouter API key and credits

## License 📄

MIT License - Feel free to modify and use!