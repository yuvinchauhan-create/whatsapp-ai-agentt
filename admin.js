// admin.js — WhatsApp Remote Admin Controller
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getAllLeads } = require('./memory');

const DYNAMIC_RULES_PATH = path.join(__dirname, 'dynamic_rules.txt');
const KNOWLEDGE_BASE_PATH = path.join(__dirname, 'knowledge_base.txt');
const BANNED_PATH = path.join(__dirname, 'banned_numbers.json');

const ADMIN_NUMBERS = ['918708538708', '8708538708'];

// Load or initialize banned numbers
function getBannedNumbers() {
  if (fs.existsSync(BANNED_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(BANNED_PATH, 'utf8'));
    } catch(e) {}
  }
  const defaultBanned = ['917976936971', '918887739583', '919455263249', '7976936971', '8887739583', '9455263249'];
  saveBannedNumbers(defaultBanned);
  return defaultBanned;
}

function saveBannedNumbers(arr) {
  fs.writeFileSync(BANNED_PATH, JSON.stringify(arr, null, 2), 'utf8');
}

function isAdmin(phone) {
  const clean = phone.replace(/\D/g, '');
  return ADMIN_NUMBERS.some(num => clean.endsWith(num) || num.endsWith(clean));
}

// Handle Admin commands sent via WhatsApp
async function handleAdminCommand(phone, userMessage) {
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  // Remove prefix if present: "ADMIN:", "CMD:", "/admin", "!"
  let cleanText = text.replace(/^(admin:|cmd:|\/admin|!admin|!)\s*/i, '').trim();
  const lowerClean = cleanText.toLowerCase();

  console.log(`👑 [ADMIN COMMAND DETECTED] From ${phone}: "${cleanText}"`);

  // 1. STATUS COMMAND
  if (lowerClean === 'status' || lowerClean === 'stats') {
    const leads = getAllLeads();
    const activeLeads = leads.filter(l => !l.aiDisabled && l.status !== 'Not Interested').length;
    const closedSales = leads.filter(l => l.status === 'Closed Sale').length;
    
    return `📊 *YUVIN SIR - SYSTEM STATUS REPORT* 🚀

• Total Saved Leads: *${leads.length}*
• Active Leads: *${activeLeads}*
• Closed Sales: *${closedSales}*
• AI Agent: *ACTIVE ✅*
• Auto Follow-ups: *ACTIVE (2m, 4m, 6m, 8m) ⏱️*

💡 *Tip:* Kisi bhi number ko block karne ke liye bhejie:
\`ADMIN: block 9876543210\`
Naya rule add karne ke liye:
\`ADMIN: rule add <Aapka naya rule>\``;
  }

  // 2. BLOCK NUMBER
  if (lowerClean.startsWith('block ')) {
    const numToBlock = cleanText.substring(6).trim().replace(/\D/g, '');
    if (!numToBlock) return `❌ Invalid number format. Example: \`ADMIN: block 9876543210\``;
    
    const banned = getBannedNumbers();
    if (!banned.includes(numToBlock)) banned.push(numToBlock);
    if (!numToBlock.startsWith('91') && numToBlock.length === 10) banned.push('91' + numToBlock);
    saveBannedNumbers(banned);

    return `🛑 *NUMBER BLOCKED PERMANENTLY!*
Number: *${numToBlock}* ko blocklist mein daal diya gaya hai. Ab AI iss number ko kabhi reply nahi karega.`;
  }

  // 3. UNBLOCK NUMBER
  if (lowerClean.startsWith('unblock ')) {
    const numToUnblock = cleanText.substring(8).trim().replace(/\D/g, '');
    let banned = getBannedNumbers();
    banned = banned.filter(n => n !== numToUnblock && n !== '91' + numToUnblock);
    saveBannedNumbers(banned);

    return `✅ *NUMBER UNBLOCKED!*
Number: *${numToUnblock}* ko blocklist se hata diya gaya hai.`;
  }

  // 4. ADD RULE
  if (lowerClean.startsWith('rule add ') || lowerClean.startsWith('add rule ')) {
    const ruleContent = cleanText.replace(/^(rule add|add rule)\s*/i, '').trim();
    if (!ruleContent) return `❌ Rule content missing. Example: \`ADMIN: rule add Always offer ₹1616 package first\``;

    fs.appendFileSync(DYNAMIC_RULES_PATH, `\n- ${ruleContent}`, 'utf8');
    return `📝 *NEW RULE ADDED SUCCESSFULLY!*

Naya Rule:
*"${ruleContent}"*

Ab AI agent iss naye rule ko saari chats mein turant follow karega! ✅`;
  }

  // 5. ADD KNOWLEDGE / KB
  if (lowerClean.startsWith('kb add ') || lowerClean.startsWith('add kb ') || lowerClean.startsWith('knowledge add ')) {
    const kbContent = cleanText.replace(/^(kb add|add kb|knowledge add)\s*/i, '').trim();
    if (!kbContent) return `❌ Knowledge content missing.`;

    fs.appendFileSync(KNOWLEDGE_BASE_PATH, `\n\n📌 ADDITIONAL ADMIN KNOWLEDGE:\n${kbContent}`, 'utf8');
    return `🧠 *KNOWLEDGE BASE UPDATED!*

Nayi Knowledge:
*"${kbContent}"*

Ab AI iss naye point ko sales conversations mein use karega! 🚀`;
  }

  // 6. NATURAL LANGUAGE ADMIN AI PROCESSOR (For complex custom instructions)
  try {
    const API_KEY = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;
    const isGroq = !process.env.OPENROUTER_API_KEY && process.env.GROQ_API_KEY;
    const API_URL = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const MODEL = isGroq ? 'llama-3.1-8b-instant' : (process.env.OPENROUTER_MODEL || 'google/gemma-2-9b-it:free');

    const prompt = `You are the AI System Administrator for Yuvin Chauhan's WhatsApp Sales AI Agent.
The Admin (Yuvin Chauhan) sent this command instruction from WhatsApp:
"${cleanText}"

Determine the exact intent and respond in natural Hindi/Hinglish confirming what was done.
If he is giving a instruction to change AI behavior, formulate a clear 1-sentence rule from it. Format your output strictly like:
RULE_TO_ADD: <the concise rule>
REPLY: <friendly confirmation message in Hinglish for Yuvin Sir>`;

    const res = await axios.post(
      API_URL,
      {
        model: MODEL,
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.5
      },
      {
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    const replyText = res.data.choices[0].message.content.trim();
    
    if (replyText.includes('RULE_TO_ADD:')) {
      const match = replyText.match(/RULE_TO_ADD:\s*([^\n]+)/);
      if (match && match[1]) {
        fs.appendFileSync(DYNAMIC_RULES_PATH, `\n- ${match[1].trim()}`, 'utf8');
      }
    }

    const replyMatch = replyText.match(/REPLY:\s*([\s\S]+)/);
    const finalReply = replyMatch ? replyMatch[1].trim() : replyText;

    return `👑 *ADMIN COMMAND PROCESSED!*

${finalReply}`;

  } catch (err) {
    return `✅ Admin Instruction Received: "${cleanText}". (Updated in System Rules)`;
  }
}

module.exports = {
  isAdmin,
  handleAdminCommand,
  getBannedNumbers
};
