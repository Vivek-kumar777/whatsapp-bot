const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

// Optional OpenAI client — used only when OPENAI_API_KEY is set in .env
let openai = null;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.MODEL || 'gpt-3.5-turbo';
if (OPENAI_API_KEY) {
  try {
    const OpenAI = require('openai');
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log('🔐 OpenAI client initialized.');
  } catch (e) {
    console.warn('⚠️ Failed to load OpenAI SDK. Install `openai` and restart to enable AI responses.');
  }
}

// Optional OpenRouter client — used when OPENROUTER_API_KEY is set in .env
let openRouter = null;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
if (OPENROUTER_API_KEY) {
  try {
    const { OpenRouter } = require('@openrouter/sdk');
    openRouter = new OpenRouter({ apiKey: OPENROUTER_API_KEY });
    console.log('🔐 OpenRouter client initialized.');
  } catch (e) {
    console.warn('⚠️ Failed to load @openrouter/sdk. Install `@openrouter/sdk` and restart to enable OpenRouter responses.');
  }
}

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    // Run headless for more stable behavior on servers; change to false if you need visible browser
    headless: true,
    // Extra flags to improve stability on Windows and constrained environments
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
    // Optional: allow specifying system chrome/chromium via env var `CHROME_PATH`
    executablePath: process.env.CHROME_PATH || undefined
  }
});

// Casual friend responses (local fallback)
const friendResponses = {
  hi: [
    "yo wassup! 👋",
    "heyy what's up!",
    "yo bro!",
    "hello! 😎",
    "whats good?"
  ],
  hello: [
    "hey there!",
    "hiii! 👋",
    "yooo!",
    "helloooo"
  ],
  how_are_you: [
    "all good yaar! u good?",
    "im good bro, u?",
    "doing great! whats up with u?",
    "pretty good! kya scene?",
    "mast hu! tu kaisa?"
  ],
  thanks: [
    "anytime dude! 😎",
    "no problem bro!",
    "happy to help!",
    "all good my friend!",
    "koi na bhai!"
  ],
  bye: [
    "alright cya later! 👋",
    "bye bro! take care!",
    "peace out! 👋",
    "see you soon!",
    "milte hain!"
  ],
  funny: [
    "lmaoooo that's funny 😂",
    "hahaha okay that got me 💀",
    "bruh that made me laugh 😂",
    "okay okay that was good 😄",
    "haha nice one!"
  ],
  random: [
    "haha okay 😂",
    "nice bro",
    "cool cool",
    "yep yep",
    "sahi hai!",
    "okay! 👍",
    "lol relatable",
    "haan samjha 😅"
  ]
};

// Message history per user
let userHistory = new Map();
const MAX_HISTORY = 15;

// Helper: Get random response from category
function getRandomResponse(category) {
  const responses = friendResponses[category] || friendResponses.random;
  return responses[Math.floor(Math.random() * responses.length)];
}

// Helper: Detect message category
function detectMessageCategory(text) {
  const lower = text.toLowerCase().trim();
  
  if (lower.match(/^(hi|hey|hello|yo|heyy|hiii|yooo|yow)/)) return 'hello';
  if (lower.match(/\bhow\s+(are\s+)?you\b/)) return 'how_are_you';
  if (lower.match(/^(thanks|thank you|thx|thnx|ty)\b/)) return 'thanks';
  if (lower.match(/^(bye|goodbye|see ya|cya|gn|good night)\b/)) return 'bye';
  if (lower.match(/^hi\b/)) return 'hi';
  
  // Detect funny/laugh reactions
  if (lower.match(/\b(haha|hehe|lol|lmao|funny|😂|😄|laugh)\b/)) return 'funny';
  
  return 'random';
}

// Helper: Add message to history
function addToHistory(userId, message, isBot = false) {
  if (!userHistory.has(userId)) {
    userHistory.set(userId, []);
  }
  
  const history = userHistory.get(userId);
  history.push({
    text: message,
    isBot: isBot,
    time: new Date()
  });
  
  // Keep only last 15 messages
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

// Helper: Get conversation context
function getContext(userId) {
  const history = userHistory.get(userId) || [];
  if (history.length === 0) return "first message";
  
  const lastMsg = history[history.length - 1];
  return lastMsg.isBot ? "after our reply" : "first in conversation";
}

// Generate an AI-powered friend-like response when OpenAI key is available
async function generateAIResponse(userText, userId) {
  const history = userHistory.get(userId) || [];
  const context = history.slice(-6).map(h => (h.isBot ? `Friend: ${h.text}` : `You: ${h.text}`)).join('\n');

  const systemPrompt = `You are a close friend texting casually in Hinglish/Hinglish+English mix. Never say you're an AI or a bot. Keep replies short, natural, and occasionally use slang like 'yaar', 'bro', 'arre'. You may include small typos and emojis to sound human.`;

  const userPrompt = `Context:\n${context}\n\nUser: ${userText}\n\nReply as a casual friend (one or two sentences).`;

  // Prefer OpenRouter if configured
  if (openRouter) {
    try {
      // Use streaming API when possible — collect chunks then return combined text
      const stream = await openRouter.chat.send({
        model: process.env.MODEL || MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: true,
        max_tokens: 300,
        temperature: 0.9
      });

      let collected = '';
      try {
        for await (const chunk of stream) {
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            collected += content;
          }
        }
      } catch (iterErr) {
        // streaming iterator error — log and fall back to non-streaming behavior
        console.error('Error while reading OpenRouter stream:', iterErr && (iterErr.message || iterErr));
      }

      if (collected && collected.trim().length > 0) return collected.trim();
    } catch (err) {
      console.error('OpenRouter request failed:', err.message || err);
      // If OpenRouter returns a 404 / "No endpoints found" for the configured model,
      // disable the OpenRouter client to avoid repeated failing requests and inform the user.
      try {
        const msg = (err && (err.message || JSON.stringify(err))).toString();
        if (msg.includes('Status 404') || msg.includes('No endpoints found')) {
          console.warn('⚠️ OpenRouter model not found:', process.env.MODEL || MODEL);
          console.warn('Disabling OpenRouter client. Update `MODEL` in .env to a valid OpenRouter model or remove `OPENROUTER_API_KEY` to stop using OpenRouter.');
          openRouter = null;
        }
      } catch (e) {
        // ignore parsing errors
      }
      // fall through to try OpenAI if available
    }
  }

  // Fallback to OpenAI if configured
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 80,
        temperature: 0.9
      });

      const aiText = completion?.choices?.[0]?.message?.content;
      if (aiText && aiText.trim().length > 0) return aiText.trim();
    } catch (err) {
      console.error('OpenAI request failed:', err.message || err);
    }
  }

  return null;
}

// QR Code event
client.on('qr', (qr) => {
  console.log('\n📱 Scan this QR code with WhatsApp:');
  qrcode.generate(qr, { small: true });
});

// Client ready
client.on('ready', () => {
  console.log('✅ WhatsApp bot is running!');
  console.log('💬 Ready to chat with your friend...');
});

// Main message handler
client.on('message', async (msg) => {
  // Ignore messages from the bot itself
  if (msg.fromMe) return;
  
  const userId = msg.from;
  const userText = msg.body;
  
  console.log(`📨 ${userId}: ${userText}`);
  
  try {
    // Add user message to history
    addToHistory(userId, userText, false);
    
    // Detect what kind of message this is
    const category = detectMessageCategory(userText);
    
    // Decide whether to use an AI provider (OpenRouter or OpenAI) or local responses
    let botReply = null;
    if (openRouter || openai) {
      // Prefer AI responses when any API key provided
      botReply = await generateAIResponse(userText, userId);
    }

    // If AI not available or didn't return a response, fall back to local replies
    if (!botReply) {
      botReply = getRandomResponse(category);
      // Occasional short reactions to feel natural
      if (Math.random() < 0.15) {
        const shortReacts = ["👍", "😂", "lol", "haha", "right?", "same bro", "yo!", "😅"];
        botReply = shortReacts[Math.floor(Math.random() * shortReacts.length)];
      }
    }

    // Send the reply
    await msg.reply(botReply);

    // Add bot reply to history
    addToHistory(userId, botReply, true);

    console.log(`🤖 Replied: ${botReply}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    try {
      await msg.reply("yaar kuch issue hua... try again!");
    } catch (e) {
      console.error('Failed to send error message:', e);
    }
  }
});

// Connection events
client.on('disconnected', (reason) => {
  console.log('⚠️ Bot disconnected:', reason);
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down bot...');
  process.exit(0);
});

// Initialize
console.log('🚀 Starting WhatsApp friend bot...');

// Initialize with retry — puppeteer/Chromium can sometimes fail transiently.
async function startClientWithRetry(retries = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Initializing client (attempt ${attempt}/${retries})...`);
      await client.initialize();
      console.log('✅ WhatsApp client initialized successfully.');
      return;
    } catch (err) {
      console.error(`Initialization attempt ${attempt} failed:`, err.message || err);
      if (attempt < retries) {
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        console.error('❌ All initialization attempts failed.');
        process.exit(1);
      }
    }
  }
}

startClientWithRetry().catch(err => {
  console.error('Unexpected error starting client:', err);
  process.exit(1);
});