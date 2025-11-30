const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { OpenRouter } = require('@openrouter/sdk');
const fs = require('fs');
require('dotenv').config();

// Configuration
const config = {
  openaiApiKey: process.env.OPENROUTER_API_KEY,
  model: process.env.MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
  offlineMode: process.env.OFFLINE_MODE === 'true',
  botTone: process.env.BOT_TONE || 'hinglish',
  fallbackMessage: "Sorry, I couldn't process your message right now. Please try again later! 😊"
};

const tonePrompts = {
  friendly: "You're a close friend chatting casually. Be warm, use slang, respond like texting a buddy. Keep it short and natural.",
  hinglish: "You're a desi friend who talks in Hinglish naturally. Don't sound like AI - be casual, use 'yaar', 'bhai', 'arre'. Make typos sometimes, use shortcuts like 'kr', 'ho', 'kya'. Sound like texting from phone. Never say you're AI or assistant. Examples: 'arre yaar kya bol rha', 'haan bhai sab theek', 'kuch nhi bas chill kr rha'",
  anime: "You're an anime fan friend. Be enthusiastic but natural, not robotic. Use expressions organically.",
  educational: "You're a smart friend helping out. Explain simply like talking to a buddy, not giving lecture."
};

// Message history storage
let messageHistory = new Map(); // userId -> array of messages
let conversationAnalysis = new Map(); // userId -> analysis data
let pausedUsers = new Map(); // userId -> pause end time

// Training data (embedded)
let trainingData = {
  patterns: [
    { input: "hello", output: "arre hello yaar! kya haal? 😎", category: "greetings" },
    { input: "hi", output: "hii bhai wassup", category: "greetings" },
    { input: "good morning", output: "morning yaar! kaisi neend aayi", category: "greetings" },
    { input: "good night", output: "gn bro! sweet dreams 🌙", category: "greetings" },
    { input: "how are you", output: "bas mast hu yaar! tu bta kya scene? 😁", category: "personal" },
    { input: "what is your name", output: "naam se kya hoga bhai 😅 tu bta tera kya", category: "personal" },
    { input: "thank you", output: "arre yaar mention not bhai ✌️", category: "courtesy" },
    { input: "thanks", output: "koi na bro chill! 😎", category: "courtesy" },
    { input: "bye", output: "bye yaar! milte h phir 👋", category: "farewells" },
    { input: "help", output: "haan bta kya problem h? 😅", category: "support" },
    { input: "kya kr rha", output: "kuch nhi yaar timepass... tu bta kya chal rha? 😎", category: "casual" },
    { input: "notes bna rha", output: "waah bhai! padhai ho rhi h 📚 nice", category: "casual" },
    { input: "kuch nhi", output: "arre kuch to hoga yaar... bore ho rha kya? 😄", category: "casual" },
    { input: "analyze", output: "haan dekh rha hun sab kuch! 📊", category: "analysis" },
    { input: "previous message", output: "purane msgs dekh rha hun! 🔍", category: "analysis" },
    { input: "chat history", output: "chat history check kr rha! 📝", category: "analysis" },
    { input: "stop.bot", output: "ok yaar 15 min ke liye chup hun! 🤐", category: "control" }
  ],
  keywords: {}
};

// Build keywords from patterns
trainingData.patterns.forEach(pattern => {
  const keywords = pattern.input.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  keywords.forEach(keyword => {
    if (!trainingData.keywords[keyword]) trainingData.keywords[keyword] = [];
    trainingData.keywords[keyword].push(pattern.output);
  });
});

// OpenRouter client
const openRouter = new OpenRouter({
  apiKey: config.openaiApiKey,
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'WhatsApp Bot'
  }
});

// Store message in history
function storeMessage(userId, message, isBot = false) {
  if (!messageHistory.has(userId)) {
    messageHistory.set(userId, []);
  }
  
  const messageData = {
    text: message,
    timestamp: new Date().toISOString(),
    isBot: isBot,
    wordCount: message.split(/\s+/).length
  };
  
  messageHistory.get(userId).push(messageData);
  
  // Keep only last 50 messages per user
  if (messageHistory.get(userId).length > 50) {
    messageHistory.get(userId).shift();
  }
}

// Analyze conversation history
function analyzeConversation(userId) {
  const messages = messageHistory.get(userId) || [];
  if (messages.length < 2) {
    return "Not enough conversation history to analyze.";
  }
  
  const userMessages = messages.filter(m => !m.isBot);
  const botMessages = messages.filter(m => m.isBot);
  
  // Basic analysis
  const totalMessages = messages.length;
  const avgWordsPerMessage = userMessages.reduce((sum, m) => sum + m.wordCount, 0) / userMessages.length;
  
  // Common topics/keywords
  const allWords = userMessages.map(m => m.text.toLowerCase()).join(' ');
  const wordFreq = {};
  allWords.split(/\s+/).forEach(word => {
    if (word.length > 2) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });
  
  const topWords = Object.entries(wordFreq)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);
  
  // Communication pattern
  const recentMessages = messages.slice(-10);
  const timePattern = analyzeTimePattern(recentMessages);
  
  return {
    totalMessages,
    userMessages: userMessages.length,
    botMessages: botMessages.length,
    avgWordsPerMessage: Math.round(avgWordsPerMessage),
    topTopics: topWords,
    timePattern,
    conversationStyle: determineConversationStyle(userMessages)
  };
}

function analyzeTimePattern(messages) {
  if (messages.length < 3) return "casual";
  
  const intervals = [];
  for (let i = 1; i < messages.length; i++) {
    const prev = new Date(messages[i-1].timestamp);
    const curr = new Date(messages[i].timestamp);
    intervals.push(curr - prev);
  }
  
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  
  if (avgInterval < 30000) return "rapid";
  if (avgInterval < 300000) return "active";
  return "casual";
}

function determineConversationStyle(userMessages) {
  const allText = userMessages.map(m => m.text.toLowerCase()).join(' ');
  
  if (allText.includes('help') || allText.includes('problem')) return "help-seeking";
  if (allText.includes('thanks') || allText.includes('good')) return "appreciative";
  if (allText.includes('hello') || allText.includes('hi')) return "friendly";
  
  return "conversational";
}

// Generate comprehensive analysis response
function generateAnalysisResponse(analysis, userId) {
  if (typeof analysis === 'string') return analysis;
  
  const messages = messageHistory.get(userId) || [];
  const recentTopics = messages.slice(-3).map(m => m.text).join(', ');
  
  return `arre yaar dekh maine analysis kiya h! 📊\n\n` +
    `total ${analysis.totalMessages} msgs kiye hain (tu: ${analysis.userMessages}, main: ${analysis.botMessages})\n` +
    `avg ${analysis.avgWordsPerMessage} words per msg\n` +
    `mostly baat kri: ${analysis.topTopics.slice(0, 3).join(', ')}\n` +
    `tera style: ${analysis.timePattern} chatting\n\n` +
    `recent msgs: "${recentTopics.substring(0, 80)}..."\n\n` +
    `${analysis.conversationStyle === 'help-seeking' ? 'lagta h help chahiye thi' : 'bas casual chat chal rhi thi'} 😄 ` +
    `${analysis.timePattern === 'rapid' ? 'tu to bohot active h yaar!' : 'chill chill msgs krta h tu'} ` +
    `kya scene h aage? 😎`;
}

// AI Response function
async function getAIResponse(userMessage, userId) {
  try {
    const cleanMessage = userMessage.replace(/[^\w\s\u0900-\u097F]/g, ' ').trim();
    if (!cleanMessage) return "I can help you with text messages. Please send a regular message!";
    
    // Check for analysis request
    if (cleanMessage.includes('analyze') || cleanMessage.includes('analysis') || 
        cleanMessage.includes('previous message') || cleanMessage.includes('chat history')) {
      const analysis = analyzeConversation(userId);
      return generateAnalysisResponse(analysis, userId);
    }
    
    // Check trained responses
    const trainedResponse = findTrainedResponse(cleanMessage);
    if (trainedResponse && trainedResponse.confidence > 0.7) {
      console.log(`🎯 Using trained response (${(trainedResponse.confidence * 100).toFixed(1)}% confidence)`);
      return trainedResponse.response;
    }
    
    // Offline mode check
    if (config.offlineMode) {
      if (trainedResponse) {
        console.log(`🔄 Offline mode: Using trained response (${(trainedResponse.confidence * 100).toFixed(1)}% confidence)`);
        return trainedResponse.response;
      }
      return "yaar offline mode me hun, kuch samjh nhi aa rha... online kr de ya kuch aur puch!";
    }
    
    // Get conversation context for AI
    const recentMessages = messageHistory.get(userId)?.slice(-5) || [];
    const contextPrompt = recentMessages.length > 0 ? 
      `\nPrevious chat: ${recentMessages.map(m => `${m.isBot ? 'You' : 'Friend'}: ${m.text}`).join(' | ')}` : '';
    
    const humanPrompt = `You're chatting with a friend on WhatsApp. ${tonePrompts[config.botTone] || tonePrompts.hinglish} \n\nIMPORTANT: \n- Never mention you're AI, bot, or assistant\n- Sound completely human and natural\n- Use casual language, slang, shortcuts\n- Make small typos occasionally \n- React emotionally like a real person\n- Don't be overly helpful or formal${contextPrompt}`;
    
    // Use AI
    const completion = await openRouter.chat.send({
      model: config.model,
      messages: [
        { role: "system", content: humanPrompt },
        { role: "user", content: cleanMessage }
      ],
      max_tokens: 60,
      temperature: 0.95,
      stream: false
    });
    
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenRouter API Error:', error.message);
    
    const trainedResponse = findTrainedResponse(userMessage);
    if (trainedResponse) {
      console.log(`🔄 API failed, using trained response (${(trainedResponse.confidence * 100).toFixed(1)}% confidence)`);
      return trainedResponse.response;
    }
    
    return config.fallbackMessage;
  }
}

// Find trained response
function findTrainedResponse(userMessage) {
  const cleanMessage = userMessage.toLowerCase().trim();
  
  // Exact match
  const exactMatch = trainingData.patterns.find(p => p.input === cleanMessage);
  if (exactMatch) return { response: exactMatch.output, confidence: 1.0 };

  // Partial match
  const partialMatches = trainingData.patterns.filter(p => {
    const pattern = p.input.toLowerCase();
    return cleanMessage.includes(pattern) || pattern.includes(cleanMessage) ||
           calculateSimilarity(cleanMessage, pattern) > 0.6;
  }).sort((a, b) => {
    const simA = calculateSimilarity(cleanMessage, a.input);
    const simB = calculateSimilarity(cleanMessage, b.input);
    return simB - simA;
  });
  
  if (partialMatches.length > 0) {
    const bestMatch = partialMatches[0];
    const similarity = calculateSimilarity(cleanMessage, bestMatch.input);
    return { response: bestMatch.output, confidence: similarity };
  }

  // Keyword match
  const userKeywords = cleanMessage.split(/\s+/).filter(w => w.length > 1);
  const keywordMatches = [];
  
  userKeywords.forEach(keyword => {
    if (trainingData.keywords[keyword]) {
      keywordMatches.push(...trainingData.keywords[keyword]);
    }
  });

  if (keywordMatches.length > 0) {
    const frequency = {};
    keywordMatches.forEach(item => frequency[item] = (frequency[item] || 0) + 1);
    const mostCommon = Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b);
    return { response: mostCommon, confidence: 0.6 };
  }

  return null;
}

function calculateSimilarity(str1, str2) {
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w));
  return commonWords.length / Math.max(words1.length, words2.length);
}

// Logging function
function logConversation(sender, message, reply) {
  const timestamp = new Date().toISOString();
  const logEntry = `\n========================================\nTimestamp: ${timestamp}\nSender: ${sender}\nQuestion: ${message}\nAnswer: ${reply}\n========================================\n`;
  
  fs.appendFile('conversations.txt', logEntry, (err) => {
    if (err) console.error('Error logging conversation:', err);
  });
}

// WhatsApp Client
console.log('🚀 Starting WhatsApp Bot...');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

client.on('qr', (qr) => {
  console.log('Scan this QR code with WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ WhatsApp bot is ready!');
  console.log(`📴 Offline Mode: ${config.offlineMode ? 'ON' : 'OFF'}`);
  console.log(`🎭 Bot Tone: ${config.botTone}`);
  console.log('\nTo change settings, edit the .env file and restart the bot.');
});

client.on('message', async (message) => {
  if (message.fromMe) return;

  const sender = message.from;
  const userMessage = message.body;

  console.log(`\n📩 Message from ${sender}: ${userMessage}`);

  // Check if user typed stop.bot
  if (userMessage.toLowerCase().trim() === 'stop.bot') {
    const pauseEndTime = Date.now() + (15 * 60 * 1000); // 15 minutes
    pausedUsers.set(sender, pauseEndTime);
    await message.reply('ok yaar 15 min ke liye chup hun! 🤐');
    console.log(`🔇 Bot paused for ${sender} until ${new Date(pauseEndTime).toLocaleTimeString()}`);
    return;
  }

  // Check if bot is paused for this user
  if (pausedUsers.has(sender)) {
    const pauseEndTime = pausedUsers.get(sender);
    if (Date.now() < pauseEndTime) {
      console.log(`🔇 Bot is paused for ${sender}`);
      return; // Don't respond
    } else {
      pausedUsers.delete(sender); // Remove expired pause
      console.log(`🔊 Bot resumed for ${sender}`);
    }
  }

  // Store user message
  storeMessage(sender, userMessage, false);

  try {
    const aiReply = await getAIResponse(userMessage, sender);
    await message.reply(aiReply);
    
    // Store bot reply
    storeMessage(sender, aiReply, true);
    
    console.log(`🤖 Bot replied: ${aiReply}`);
    logConversation(sender, userMessage, aiReply);
  } catch (error) {
    console.error('Error handling message:', error);
    await message.reply(config.fallbackMessage);
    storeMessage(sender, config.fallbackMessage, true);
    logConversation(sender, userMessage, config.fallbackMessage);
  }
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Client was disconnected:', reason);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled error:', err.message);
});

process.on('SIGINT', () => {
  console.log('\n👋 Bot stopped by user');
  process.exit(0);
});

console.log('⚡ Initializing WhatsApp client...');
client.initialize().catch(err => {
  console.error('❌ Failed to initialize:', err.message);
  process.exit(1);
});