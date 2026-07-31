// manager.js - The AI Auditor System
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getAllLeads } = require('./memory');

const DYNAMIC_RULES_PATH = path.join(__dirname, 'dynamic_rules.txt');

if (!fs.existsSync(DYNAMIC_RULES_PATH)) {
  fs.writeFileSync(DYNAMIC_RULES_PATH, 'No dynamic rules yet.', 'utf8');
}

async function auditConversations() {
  console.log('🕵️‍♂️ [MANAGER] Starting audit of recent conversations...');
  
  const leads = getAllLeads();
  if (leads.length === 0) {
    console.log('🕵️‍♂️ [MANAGER] No leads to audit.');
    return;
  }

  // Get the 5 most recently active leads
  const recentLeads = leads.slice(0, 5);
  let auditContext = '';

  for (const lead of recentLeads) {
    const filePath = path.join(__dirname, 'conversations', `${lead.phone}.json`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const history = data.history || [];
      // Get last 6 messages
      const recentHistory = history.slice(-6).map(h => `${h.role === 'user' ? 'Lead' : 'AI'}: ${h.content}`).join('\n');
      auditContext += `\n--- Conversation with ${lead.phone} ---\n${recentHistory}\n`;
    }
  }

  const prompt = `You are the AI Manager Auditor. Your job is to review the recent WhatsApp sales conversations and identify if the AI Sales Agent is making any mistakes, being too robotic, or losing the leads.
  
RECENT CONVERSATIONS:
${auditContext}

Based on these conversations, write 2-3 STRICT, SHORT, PUNCHY RULES that the AI agent must follow to improve conversion and sound more human. 
These rules will be injected directly into the AI's brain.
DO NOT include any pleasantries, intro, or markdown. JUST output the rules as plain text, bullet points.
Example:
- Always use the lead's name in every message.
- If they ask for proof, immediately send the instagram link.`;

  try {
    const API_KEY = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;
    const isGroq = !process.env.OPENROUTER_API_KEY && process.env.GROQ_API_KEY;
    const API_URL = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    
    // Use a fast, free model for auditing to save costs
    const MODEL = isGroq ? 'llama-3.1-8b-instant' : (process.env.OPENROUTER_MODEL || 'google/gemma-2-9b-it:free');

    const res = await axios.post(
      API_URL,
      {
        model: MODEL,
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.7,
        max_tokens: 200
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    let newRules = res.data.choices[0].message.content.trim();
    newRules = newRules.replace(/<(think|thought|reasoning)>[\s\S]*?<\/\1>/gi, '').trim();

    if (newRules && newRules.length > 10) {
      fs.writeFileSync(DYNAMIC_RULES_PATH, newRules, 'utf8');
      console.log('✅ [MANAGER] Dynamic Rules Updated:\n' + newRules);
    }
  } catch (err) {
    console.error('❌ [MANAGER] Error running audit:', err.message);
  }
}

// Run audit every 1 hour (3600000 ms)
function startManager() {
  console.log('👔 Manager Tool initialized. Auditing every 1 hour.');
  setInterval(auditConversations, 60 * 60 * 1000);
}

module.exports = { startManager, auditConversations };
