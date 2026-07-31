// followup_scheduler.js — Version 1 Follow-up Engine

const { getLeadRecord, saveLeadRecord } = require('./memory');
const { sendMessage } = require('./whatsapp');
const { detectGender, getRespectfulSalutation } = require('./gender');
const axios = require('axios');

const activeTimers = {}; // phone -> { stage1, stage2, stage3, stage4 }

// =============================================
// GENERATE PERSONALIZED AI FOLLOWUP MESSAGE
// =============================================
async function generateAIFollowupMessage(phone, stage) {
  const record = getLeadRecord(phone);
  const history = record.history || [];
  const gender = record.profile.gender || detectGender(record.leadName);
  const salutation = getRespectfulSalutation(gender, record.leadName);

  const lastAiMsg = history.filter(h => h.role === 'assistant').pop()?.content || '';

  let stageGoal = '';
  if (stage === 1) {
    stageGoal = '10 minutes after no reply. Send a gentle human check-in asking if they are still there or busy.';
  } else if (stage === 2) {
    stageGoal = '15 minutes after no reply. Ask gently if they are facing any issues understanding the details.';
  } else if (stage === 3) {
    // Stage 3 uses the EXACT hardcoded structure from the user request
    return `Highlights dekhli proofs dekh liye? 10 mint ka yt video dekha ??? Business kaise karna hai sab roadmap dunga, earning nahi hui aapki, paisa wapis okay.`;
  } else if (stage === 4) {
    stageGoal = '1 hour after no reply. Gentle reminder asking if they want to proceed with earning or miss out.';
  }

  const prompt = `You are Yuvin Chauhan Sir (AI & Automation Sales Mentor). 
You are following up with lead (${record.leadName || 'Friend'}, Gender: ${gender.toUpperCase()}, Salutation: "${salutation}").

STAGE: ${stageGoal}

YOUR LAST MESSAGE TO THEM:
"${lastAiMsg.substring(0, 150)}"

STRICT INSTRUCTIONS:
- Write in short, punchy 1-2 line chunks.
- Natural Hindi/Hinglish language.
- NO XML tags, NO reasoning. Output ONLY the WhatsApp message text.`;

  try {
    const API_KEY = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;
    const isGroq = !process.env.OPENROUTER_API_KEY && process.env.GROQ_API_KEY;
    const API_URL = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const MODEL = isGroq ? 'llama-3.1-8b-instant' : (process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini');

    const res = await axios.post(
      API_URL,
      {
        model: MODEL,
        messages: [{ role: 'system', content: prompt }],
        max_tokens: 100,
        temperature: 0.8
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    let reply = res.data.choices[0].message.content.trim();
    reply = reply.replace(/<(think|thought|reasoning)>[\s\S]*?<\/\1>/gi, '').trim();
    return reply;
  } catch (err) {
    // Fallback if AI error
    if (stage === 1) return `Kya hua ${salutation}? Kahi busy ho gaye kya?`;
    if (stage === 2) return `${salutation}, koi doubt hai kya? Batao mujhe main help kar deta hu.`;
    if (stage === 4) return `${salutation}, 1 ghanta ho gaya! Start karna hai ya miss karna chahte ho?`;
    return `Reply kariye ji 🙏`;
  }
}

// =============================================
// SCHEDULE PER-LEAD FOLLOWUPS
// =============================================
function schedulePerLeadFollowup(phone) {
  cancelPerLeadFollowup(phone); // Clear existing timers

  const timers = {};

  // STAGE 1: 10 Minutes (10 * 60 * 1000)
  timers.stage1 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [FOLLOWUP - STAGE 1 (10m)] Sending to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 1);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 10 * 60 * 1000);

  // STAGE 2: 15 Minutes (15 * 60 * 1000)
  timers.stage2 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [FOLLOWUP - STAGE 2 (15m)] Sending to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 2);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 15 * 60 * 1000);

  // STAGE 3: 30 Minutes (30 * 60 * 1000)
  timers.stage3 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [FOLLOWUP - STAGE 3 (30m)] Sending exact user-requested message to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 3);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 30 * 60 * 1000);

  // STAGE 4: 1 Hour (60 * 60 * 1000)
  timers.stage4 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [FOLLOWUP - STAGE 4 (1h)] Sending to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 4);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 60 * 60 * 1000);

  activeTimers[phone] = timers;
  console.log(`⏱️ [SCHEDULER] Timers set for ${phone} (10m, 15m, 30m, 1h)`);
}

async function sendAndLogFollowup(phone, record, msg) {
  try {
    await sendMessage(phone, msg);
    record.history = record.history || [];
    record.history.push({ role: 'assistant', content: msg });
    record.lastAiMsgAt = new Date();
    saveLeadRecord(phone, record);
    console.log(`✅ Followup sent to ${phone}: "${msg.substring(0, 80)}..."`);
  } catch (e) {
    console.error(`❌ Followup send error for ${phone}:`, e.message);
  }
}

// Helper: Check if lead sent a message after the last assistant message
function hasLeadRepliedSinceLastAi(record) {
  const history = record.history || [];
  if (history.length === 0) return false;

  let lastUserIdx = -1;
  let lastAiIdx = -1;

  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user' && lastUserIdx === -1) lastUserIdx = i;
    if (history[i].role === 'assistant' && lastAiIdx === -1) lastAiIdx = i;
  }

  return lastUserIdx > lastAiIdx;
}

// =============================================
// CANCEL FOLLOWUPS WHEN LEAD REPLIES
// =============================================
function cancelPerLeadFollowup(phone) {
  if (activeTimers[phone]) {
    if (activeTimers[phone].stage1) clearTimeout(activeTimers[phone].stage1);
    if (activeTimers[phone].stage2) clearTimeout(activeTimers[phone].stage2);
    if (activeTimers[phone].stage3) clearTimeout(activeTimers[phone].stage3);
    if (activeTimers[phone].stage4) clearTimeout(activeTimers[phone].stage4);
    delete activeTimers[phone];
    console.log(`🛑 [FOLLOWUP SCHEDULER] Timers cancelled for ${phone} (replied)`);
  }
}

module.exports = {
  schedulePerLeadFollowup,
  cancelPerLeadFollowup
};
