// followup_scheduler.js — Smart Per-Lead 4-Stage AI Follow-up & 22-Hour Window Keeper Engine
// Dynamic per-lead timers (20m, 1h, 4h, 21h) with value, motivation, & 24h window keeper safeguards

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
    stageGoal = '15-20 minutes after no reply. Ask a gentle, caring question why they stopped replying (e.g., "Sab theek haina? Kahi busy toh nahi ho gaye?").';
  } else if (stage === 2) {
    stageGoal = '1 hour after no reply. Polite urgency: Ask if they are serious or not, remind them time is valuable for both.';
  } else if (stage === 3) {
    stageGoal = '4 hours after no reply. Share a quick benefit of Affiliate Marketing / Online Earning & remind them of 8 PM Zoom meeting or YouTube video: https://youtu.be/HXU2uu77mSk?si=_J4OJ-atNPBbmfIg.';
  } else if (stage === 4) {
    stageGoal = 'CRITICAL 22-HOUR WINDOW KEEPER (21 Hours after last message). Send an inspiring Hi/Hello message showing benefits of LeadsGuru, financial freedom, & digital skills. Ask them to reply "HI" or "YES" so we stay connected before 24h expires!';
  }

  const prompt = `You are Yuvin Chauhan (26, Karnal, LeadsGuru Top Affiliate & Mentor, ₹15Lakh+ earned). 
You are following up with lead (${record.leadName || 'Friend'}, Gender: ${gender.toUpperCase()}, Salutation: "${salutation}").

STAGE: ${stageGoal}

YOUR LAST MESSAGE TO THEM:
"${lastAiMsg.substring(0, 150)}"

LEAD SITUATION & PROFILE:
- Occupation: ${record.profile.occupation || 'Not specified'}
- Challenge: ${record.profile.dream || record.profile.reason || 'Wants income growth'}

STRICT INSTRUCTIONS:
- Write 2-3 lines in natural, warm Hinglish.
- GENDER RESPECT: FEMALE = "Mam" or "${record.leadName || 'Lead'} ji" (NEVER say bhai/bro). MALE = "bhai" / "bro".
- Highlight benefits: Financial Freedom, Online Earning, Digital Skills, LeadsGuru Mentorship.
- Drive them to reply "HI", "YES", or "I AM INTERESTED" so they buy LeadsGuru package (₹1,616 / EMI ₹500/mo).
- NO XML tags, NO reasoning. Output ONLY the WhatsApp message text.`;

  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: prompt }],
        max_tokens: 180,
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
    if (stage === 1) return `${salutation}, aapne mere pichle message ka reply nahi kiya... 😅 Sab theek haina? Kahi busy toh nahi ho gaye?`;
    if (stage === 2) return `${salutation}, 1 ghanta ho gaya! Kam se kam bata toh do — serious ho ya nahi? Mera time bhi valuable hai, aapka bhi! 🙏`;
    if (stage === 3) return `${salutation}, aaj 8 PM Masterclass hai! Kya aapne ye full video dekhi: https://youtu.be/HXU2uu77mSk?si=_J4OJ-atNPBbmfIg ? Reply kijiye! 🚀`;
    return `${salutation}, Hi! 👋 Just checking in — online business aur financial freedom start karne ke liye ready ho? Ek 'HI' reply kar dijiye taaki hum connected rahein! 🔥`;
  }
}

// =============================================
// SCHEDULE PER-LEAD 4-STAGE FOLLOWUPS
// =============================================
function schedulePerLeadFollowup(phone) {
  cancelPerLeadFollowup(phone); // Clear existing timers

  const timers = {};

  // STAGE 1: 20 Minutes (20 * 60 * 1000)
  timers.stage1 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [DYNAMIC FOLLOWUP - STAGE 1 (20m)] Sending check-in to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 1);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 20 * 60 * 1000);

  // STAGE 2: 60 Minutes (60 * 60 * 1000)
  timers.stage2 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [DYNAMIC FOLLOWUP - STAGE 2 (1h)] Sending urgency check-in to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 2);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 60 * 60 * 1000);

  // STAGE 3: 4 Hours (4 * 60 * 60 * 1000)
  timers.stage3 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`⏰ [DYNAMIC FOLLOWUP - STAGE 3 (4h)] Sending Masterclass & Value nudge to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 3);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 4 * 60 * 60 * 1000);

  // STAGE 4: 21 Hours (21 * 60 * 60 * 1000) — 22-HOUR WINDOW KEEPER SAFEGUARD
  timers.stage4 = setTimeout(async () => {
    const record = getLeadRecord(phone);
    if (hasLeadRepliedSinceLastAi(record)) return;

    console.log(`🛡️ [22-HOUR WINDOW KEEPER - STAGE 4 (21h)] Sending 24h window safeguard nudge to ${phone}...`);
    const msg = await generateAIFollowupMessage(phone, 4);
    if (msg) sendAndLogFollowup(phone, record, msg);
  }, 21 * 60 * 60 * 1000);

  activeTimers[phone] = timers;
  console.log(`⏱️ [FOLLOWUP SCHEDULER] 4-Stage Timers set for ${phone} (Includes 21h Window Keeper)`);
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
    console.log(`🛑 [FOLLOWUP SCHEDULER] 4-Stage Timers cancelled for ${phone} (replied)`);
  }
}

module.exports = {
  schedulePerLeadFollowup,
  cancelPerLeadFollowup
};
