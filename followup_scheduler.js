// followup_scheduler.js — Smart Per-Lead Variable AI Follow-up Scheduler
// Schedules personalized follow-ups for EVERY lead if they don't reply in time

const { getLeadRecord, saveLeadRecord } = require('./memory');
const { sendMessage } = require('./whatsapp');
const { detectGender, getRespectfulSalutation } = require('./gender');
const axios = require('axios');

const activeTimers = {}; // phone -> { stage1, stage2, stage3 }

// =============================================
// GENERATE PERSONALIZED AI FOLLOWUP MESSAGE
// =============================================
async function generateAIFollowupMessage(phone, stage) {
  const record = getLeadRecord(phone);
  const history = record.history || [];
  const gender = record.profile.gender || detectGender(record.leadName);
  const salutation = getRespectfulSalutation(gender, record.leadName);

  const lastAiMsg = history.filter(h => h.role === 'assistant').pop()?.content || '';

  const prompt = `You are Yuvin Chauhan (26, Karnal, LeadsGuru Top Affiliate & Mentor). 
You previously sent a message to the lead (${record.leadName || 'Friend'}, Gender: ${gender.toUpperCase()}, Salutation: "${salutation}").
The lead HAS NOT REPLIED to your last message!

Your last message to them was:
"${lastAiMsg.substring(0, 150)}"

STAGE: ${stage === 1 ? '15-20 Minutes after no reply' : stage === 2 ? '1 Hour after no reply' : '4 Hours after no reply'}

INSTRUCTIONS:
- Write a short 2-3 line friendly Hinglish follow-up asking why they haven't replied.
- Respect gender rules: FEMALE = "Mam" or "${record.leadName || 'Lead'} ji" (NEVER say bhai/bro). MALE = "bhai" / "bro".
- Ask a direct question asking why they stopped responding (e.g., "Aapne reply nahi kiya... Sab theek haina? Kahi busy toh nahi ho gaye?").
- Keep it natural, human, and caring — like a real mentor checking in.
- NO XML tags, NO reasoning, NO meta commentary. Output ONLY the WhatsApp message.`;

  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: prompt }],
        max_tokens: 150,
        temperature: 0.8
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
    if (stage === 1) return `${salutation}, aapne mere pichle message ka reply nahi kiya... 😅 Sab theek haina? Kahi busy toh nahi ho gaye?`;
    if (stage === 2) return `${salutation}, 1 ghanta ho gaya! Kam se kam bata toh do — serious ho ya nahi? Mera time bhi valuable hai, aapka bhi! 🙏`;
    return `${salutation}, aaj 8 PM Masterclass hai! Kya aapne video dekhi? Reply kijiye! 🚀`;
  }
}

// =============================================
// SCHEDULE PER-LEAD FOLLOWUPS
// =============================================
function schedulePerLeadFollowup(phone) {
  cancelPerLeadFollowup(phone); // Clear existing timers first

  const timers = {};

  // STAGE 1: 20 Minutes (20 * 60 * 1000)
  timers.stage1 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [SMART FOLLOWUP - STAGE 1] Sending 20-min check-in to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 1);
    if (msg) {
      await sendMessage(phone, msg);
      record.history = record.history || [];
      record.history.push({ role: 'assistant', content: msg });
      saveLeadRecord(phone, record);
    }
  }, 20 * 60 * 1000);

  // STAGE 2: 60 Minutes (60 * 60 * 1000)
  timers.stage2 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [SMART FOLLOWUP - STAGE 2] Sending 1-hour check-in to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 2);
    if (msg) {
      await sendMessage(phone, msg);
      record.history = record.history || [];
      record.history.push({ role: 'assistant', content: msg });
      saveLeadRecord(phone, record);
    }
  }, 60 * 60 * 1000);

  // STAGE 3: 4 Hours (4 * 60 * 60 * 1000)
  timers.stage3 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [SMART FOLLOWUP - STAGE 3] Sending 4-hour final check-in to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 3);
    if (msg) {
      await sendMessage(phone, msg);
      record.history = record.history || [];
      record.history.push({ role: 'assistant', content: msg });
      saveLeadRecord(phone, record);
    }
  }, 4 * 60 * 60 * 1000);

  activeTimers[phone] = timers;
  console.log(`⏱️ [FOLLOWUP SCHEDULER] Active 3-stage timers set for lead: ${phone}`);
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
    delete activeTimers[phone];
    console.log(`🛑 [FOLLOWUP SCHEDULER] Timers cancelled for lead ${phone} (replied)`);
  }
}

module.exports = {
  schedulePerLeadFollowup,
  cancelPerLeadFollowup
};
