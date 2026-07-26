// campaign.js — Webinar Follow-up Campaign Engine
// Sends initial message to 100 leads, tracks replies, auto-follows up after 20 min

const { getAllLeads, getLeadRecord, saveLeadRecord, updateLeadStatus } = require('./memory');
const { sendMessage } = require('./whatsapp');

const campaignTimers = {}; // phone -> followup timer
const campaignReplied = new Set(); // phones who replied to campaign

// =============================================
// CAMPAIGN MESSAGES
// =============================================
const INITIAL_MSG = `Namaste! 🙏

Aapne hamare ad dekh ke contact kiya tha — aaj main seedha poochna chahta hoon:

*Kya aap abhi bhi online earning mein interested hain?*

Ya aapne sirf curiosity mein ad click kiya tha?

Agar aap *sach mein apna online business shuru karna chahte hain* toh reply karein — main Yuvin Chauhan personally aapki help karunga. 💪

— Yuvin Chauhan | LeadsGuru Top Affiliate`;

const FOLLOWUP_20MIN = `Bhai/Mam, abhi tak aapne reply nahi kiya... 😅

Kam se kam itna toh bata do — *serious ho ya nahi?*

Pata nahi kyun log reply nahi karte jab baat unki life change karne ki ho 🤷‍♂️

Reply karo — ek message bhejo. Main wait kar raha hoon. 🙏

— Yuvin`;

const WEBINAR_NOT_SEEN_MSG = (name) => `Koi baat nahi ${name || 'bhai'}! 😊

Agar aap *sach mein serious ho* toh mujhe WhatsApp call karo — main aapko personally:
✅ Pura business samjha dunga
✅ Live Webinar ka link dunga
✅ Aapke saare doubts clear karunga

*Bas call karo — free hai, koi charge nahi!* 📞

Ya reply karo: *"I AM INTERESTED"* — main khud aapko call karunga! 🔥`;

const WEBINAR_SEEN_MSG = (name) => `Wah! Achha hua aapne dekha ${name || ''}! 😊

Quick questions:
1️⃣ *Pura dekha ya aadha?* (1.5 ghante ka tha)
2️⃣ *Start na karne ka reason kya hai?*

[ ] Business samajh nahi aaya
[ ] Paison ki problem hai  
[ ] Trust nahi ho raha
[ ] Darr lag raha hai
[ ] Koi aur reason

Sach batao — *har problem ka solution hai!* 💪`;

const OBJECTION_REPLY = (name) => `${name || 'Bhai'}, sun — 

Yahan *chhote-chhote bacche bhi ₹4,000-10,000 lagake shuru kar rahe hain* aur paise kama rahe hain! 

Paisa? — EMI option hai, ₹500/month se shuru!
Trust? — 5 saal ka experience, ₹15 Lakh+ earned!
Darr? — Main personally guide karunga! 🤝

Agar *ek bhi chance dena chahte ho apni life ko* toh likho:

👉 *"I AM INTERESTED"*

Main aapko call karke sab clear kar dunga! 📞`;

const FINAL_FOLLOWUP = (name) => `${name || 'Bhai/Mam'}, last baar pooch raha hoon —

*Aap serious ho ya nahi?*

Mera time bhi valuable hai, aapka bhi. 

Agar *nahi karna* — seedha bol do, koi baat nahi ✅
Agar *karna hai* — toh abhi likho: *"I AM INTERESTED"*

Yahan sirf dekho status story mein rehne se kuch nahi hoga. Jo action leta hai, wahi aage jaata hai. 🚀

— Yuvin Chauhan`;

// =============================================
// START CAMPAIGN FOR LEADS
// =============================================
async function startWebinarCampaign(limit = 100) {
  const allLeads = getAllLeads();
  
  // Filter: exclude already interested/closed, take first `limit`
  const targetLeads = allLeads
    .filter(l => !['Closed Sale', 'Not Interested', 'Hot Lead'].includes(l.status))
    .slice(0, limit);

  console.log(`\n🚀 [CAMPAIGN STARTED] Targeting ${targetLeads.length} leads...`);

  let count = 0;
  for (const lead of targetLeads) {
    // Clear old conversation history for fresh start
    const record = getLeadRecord(lead.phone);
    record.history = [];
    record.campaignStatus = 'SENT';
    record.campaignSentAt = new Date();
    saveLeadRecord(lead.phone, record);

    // Send initial message with 3-second gap between each
    try {
      await sendMessage(lead.phone, INITIAL_MSG);
      console.log(`✅ Campaign msg sent to ${lead.leadName} (${lead.phone})`);
      count++;

      // Set 20-min follow-up timer
      scheduleCampaignFollowup(lead.phone, lead.leadName, 1);
    } catch (err) {
      console.error(`❌ Failed to send to ${lead.phone}:`, err.message);
    }

    await sleep(3000); // 3 sec gap between messages to avoid spam block
  }

  console.log(`\n✅ [CAMPAIGN COMPLETE] Sent to ${count} leads.`);
  return count;
}

// =============================================
// SCHEDULE 20-MIN FOLLOW-UP
// =============================================
function scheduleCampaignFollowup(phone, name, attempt) {
  if (campaignTimers[phone]) clearTimeout(campaignTimers[phone]);

  campaignTimers[phone] = setTimeout(async () => {
    // Check if lead replied
    const record = getLeadRecord(phone);
    const lastHistory = record.history || [];
    const lastUserMsg = lastHistory.filter(h => h.role === 'user').pop();

    if (lastUserMsg) {
      // They replied — don't send followup
      console.log(`✅ ${phone} already replied — skipping followup`);
      return;
    }

    // No reply — send followup
    if (attempt === 1) {
      console.log(`⏰ [FOLLOWUP 1] Sending 20-min followup to ${phone}...`);
      await sendMessage(phone, FOLLOWUP_20MIN);
      scheduleCampaignFollowup(phone, name, 2); // Schedule 2nd followup
    } else if (attempt === 2) {
      console.log(`⏰ [FOLLOWUP 2] Sending final followup to ${phone}...`);
      await sendMessage(phone, FINAL_FOLLOWUP(name));
    }

    delete campaignTimers[phone];
  }, 20 * 60 * 1000); // 20 minutes
}

// =============================================
// CANCEL FOLLOWUP WHEN LEAD REPLIES
// =============================================
function cancelCampaignFollowup(phone) {
  if (campaignTimers[phone]) {
    clearTimeout(campaignTimers[phone]);
    delete campaignTimers[phone];
    console.log(`🛑 Campaign followup cancelled for ${phone} (replied)`);
  }
}

// =============================================
// HANDLE CAMPAIGN REPLY FROM LEAD
// =============================================
async function handleCampaignReply(phone, message, leadName) {
  const msg = message.toLowerCase().trim();
  const record = getLeadRecord(phone);
  const name = record.leadName || leadName || '';

  cancelCampaignFollowup(phone); // Cancel pending followup

  // "I AM INTERESTED" detection
  if (msg.includes('i am interested') || msg.includes('interested') || msg.includes('haan') || msg.includes('yes') || msg.includes('han')) {
    updateLeadStatus(phone, 'Hot Lead');
    record.campaignStatus = 'INTERESTED';
    record.interestedAt = new Date();
    saveLeadRecord(phone, record);
    console.log(`🔥 HOT LEAD DETECTED: ${phone} (${name}) replied INTERESTED!`);

    await sendMessage(phone, `Bahut Badiya ${name}! 🔥

Main Yuvin Chauhan aapko *personally call karunga* aaj hi!

Tab tak aap ye watch karo:
👉 https://www.youtube.com/@yuvinchauhann

Aur apna naam + best time for call reply karo! 📞`);
    return 'INTERESTED';
  }

  // Webinar seen / not seen
  if (msg.includes('dekha') || msg.includes('dekh') || msg.includes('watched') || msg.includes('seen')) {
    record.campaignStatus = 'WEBINAR_SEEN';
    saveLeadRecord(phone, record);
    await sendMessage(phone, WEBINAR_SEEN_MSG(name));
    scheduleCampaignFollowup(phone, name, 2);
    return 'WEBINAR_SEEN';
  }

  if (msg.includes('nahi dekha') || msg.includes('nahin') || msg.includes('nhi') || msg.includes('not seen') || msg.includes('nhi dekha')) {
    record.campaignStatus = 'WEBINAR_NOT_SEEN';
    saveLeadRecord(phone, record);
    await sendMessage(phone, WEBINAR_NOT_SEEN_MSG(name));
    scheduleCampaignFollowup(phone, name, 2);
    return 'WEBINAR_NOT_SEEN';
  }

  // Objection / reasons
  if (msg.includes('paisa') || msg.includes('paise') || msg.includes('trust') || msg.includes('darr') || msg.includes('samajh') || msg.includes('problem') || msg.includes('doubt')) {
    record.campaignStatus = 'OBJECTION';
    saveLeadRecord(phone, record);
    await sendMessage(phone, OBJECTION_REPLY(name));
    scheduleCampaignFollowup(phone, name, 2);
    return 'OBJECTION';
  }

  // Not interested
  if (msg.includes('nahi') || msg.includes('not interested') || msg.includes('no') || msg.includes('band karo') || msg.includes('stop')) {
    updateLeadStatus(phone, 'Not Interested');
    record.campaignStatus = 'NOT_INTERESTED';
    saveLeadRecord(phone, record);
    await sendMessage(phone, `Theek hai ${name}! Koi baat nahi 🙏\n\nAapko unsubscribe kar diya gaya. Kabhi bhi wapas aana chahein toh reply karein "START". Good luck! 😊`);
    return 'NOT_INTERESTED';
  }

  // Generic reply — ask webinar question
  record.campaignStatus = 'REPLIED';
  saveLeadRecord(phone, record);
  await sendMessage(phone, `Shukriya reply karne ke liye ${name}! 😊\n\nEk quick sawal: *Aapne hamare 8 PM ya 2 PM wala Live Webinar dekha hai?*\n\n✅ Haan dekha\n❌ Nahi dekha`);
  scheduleCampaignFollowup(phone, name, 2);
  return 'REPLIED';
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  startWebinarCampaign,
  handleCampaignReply,
  cancelCampaignFollowup,
  campaignTimers
};
