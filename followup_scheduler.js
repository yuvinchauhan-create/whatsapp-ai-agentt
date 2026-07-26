// followup_scheduler.js — Ultra-Fast 5-Minute Human Follow-up & 22-Hour Window Keeper Engine

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
    stageGoal = '5 minutes after no reply to your question. Send a gentle, warm 1-2 line human check-in asking why they stopped responding (e.g., "Aapne reply nahi kiya... Kahi busy toh nahi ho gaye? Sach batao bhai/mam!"). Give real human value.';
  } else if (stage === 2) {
    stageGoal = '20 minutes after no reply. Ask if they are serious about their career/online earning or just exploring.';
  } else if (stage === 3) {
    stageGoal = '1 hour after no reply. Polite urgency: Remind them time is valuable and ask for a call or reply.';
  } else if (stage === 4) {
    stageGoal = '21 Hours after last message (22-Hour Window Keeper). Send an inspiring Hi/Hello message showing benefits of LeadsGuru & digital skills. Ask them to reply "HI" or "YES" so we stay connected before 24h expires!';
  }

  const prompt = `You are Yuvin Chauhan (26, Karnal, LeadsGuru Top Affiliate & Mentor). 
You are following up with lead (${record.leadName || 'Friend'}, Gender: ${gender.toUpperCase()}, Salutation: "${salutation}").

STAGE: ${stageGoal}

YOUR LAST MESSAGE TO THEM:
"${lastAiMsg.substring(0, 150)}"

LEAD SITUATION:
- Occupation: ${record.profile.occupation || 'Not specified'}
- Challenge: ${record.profile.dream || record.profile.reason || 'Wants income growth'}

STRICT INSTRUCTIONS:
- Write in short, punchy 1-2 line chunks with clear line breaks.
- GENDER RESPECT: FEMALE = "Mam" or "${record.leadName || 'Lead'} ji" (NEVER say bhai/bro). MALE = "bhai" / "bro".
- Drive them to reply "HI", "YES", or "I AM INTERESTED".
- NO XML tags, NO reasoning. Output ONLY the WhatsApp message text.`;

  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: prompt }],
        max_tokens: 150,
        temperature: 0.85
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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
    if (stage === 1) return `${salutation}, aapne reply nahi kiya... 😅 Sab theek haina? Kahi busy toh nahi ho gaye?`;
    if (stage === 2) return `${salutation}, 20 min ho gaye! Sach batao — online earning ko lekar serious ho na?`;
    if (stage === 3) return `${salutation}, 1 ghanta ho gaya! Kam se kam bata toh do — serious ho ya nahi? 🙏`;
    return `${salutation}, Hi! 👋 Just checking in — online business start karne ke liye ready ho? Ek 'HI' reply kar dijiye! 🔥`;
  }
}

// =============================================
// SCHEDULE PER-LEAD ULTRA-FAST FOLLOWUPS
// =============================================
function schedulePerLeadFollowup(phone) {
  cancelPerLeadFollowup(phone); // Clear existing timers

  const timers = {};

  // STAGE 1: 5 Minutes (5 * 60 * 1000)
  timers.stage1 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [ULTRA-FAST FOLLOWUP - STAGE 1 (5m)] Sending check-in to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 1);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 5 * 60 * 1000);

  // STAGE 2: 20 Minutes (20 * 60 * 1000)
  timers.stage2 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [ULTRA-FAST FOLLOWUP - STAGE 2 (20m)] Sending seriousness check-in to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 2);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 20 * 60 * 1000);

  // STAGE 3: 60 Minutes (60 * 60 * 1000)
  timers.stage3 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [ULTRA-FAST FOLLOWUP - STAGE 3 (1h)] Sending urgency check-in to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 3);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 60 * 60 * 1000);

  // STAGE 4: 21 Hours (21 * 60 * 60 * 1000) — 22-HOUR WINDOW KEEPER SAFEGUARD
  timers.stage4 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`🛡️ [22-HOUR WINDOW KEEPER - STAGE 4 (21h)] Sending 24h window safeguard nudge to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 4);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 21 * 60 * 60 * 1000);

  activeTimers[phone] = timers;
  console.log(`⏱️ [ULTRA-FAST SCHEDULER] Timers set for ${phone} (5m, 20m, 1h, 21h Window Keeper)`);
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
