// server.js — BotBiz webhook handler + Dashboard + Qualification Profile + Campaign Engine
require('dotenv').config();
const express = require('express');
const path = require('path');
const { handleMessage } = require('./agent');
const { sendMessage } = require('./whatsapp');
const { sendWelcomeEmail, sendWebinarReminderEmail } = require('./email');
const { getHistory, getAllLeads, updateLeadStatus, updateLeadProfile, getLeadRecord, saveLeadRecord } = require('./memory');
const { startWebinarCampaign, handleCampaignReply, cancelCampaignFollowup } = require('./campaign');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Root route -> serve CRM Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'WhatsApp AI Agent is Running 🚀' });
});

// System state
let aiEnabled = true;
const processedMessages = new Set();
const knownLeads = new Map();
const unsubscribedLeads = new Set();
const followUpTimers = {};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =============================================
// WEBINAR BLAST FUNCTION
// =============================================
async function triggerWebinarBlast() {
  const leads = getAllLeads();
  console.log(`\n🔴 [WEBINAR BLAST STARTED] Broadcasting to ${leads.length} leads with safety delays...`);
  let count = 0;

  const webinarBanner = "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=80";
  const webinarLink = "https://www.zoom.com/8pm-meeting";

  for (const lead of leads) {
    if (unsubscribedLeads.has(lead.phone) || lead.status === 'Not Interested') {
      console.log(`⏭️ Skipping unsubscribed/not interested lead: ${lead.phone}`);
      continue;
    }

    updateLeadStatus(lead.phone, 'Webinar Joined');

    const waMsg = 
`🔴 *EXCLUSIVE 8 PM LIVE WEBINAR!* 🚀

Hi ${lead.leadName || 'Friend'},

Aaj raat *8:00 PM* Yuvin Chauhan ka Exclusive Masterclass start hone wala hai! 

Is session mein seekho kaise 5 saal mein *₹15 Lakh+* earn kiya gaya aur aap kaise start kar sakte ho.

🖼️ *Banner:* ${webinarBanner}
🔗 *Join Zoom Link:* ${webinarLink}

⚠️ *Note:* Seats limited hain, 5 mins pehle join kar lena!

---
🛑 *Reply STOP to unsubscribe from reminders anytime.*`;

    await sendMessage(lead.phone, waMsg);
    count++;

    if (lead.email) {
      await sendWebinarReminderEmail(lead.email, lead.leadName, webinarLink);
    }

    await sleep(1500);
  }

  console.log(`✅ [WEBINAR BLAST COMPLETE] Sent to ${count} leads safely.`);
  return count;
}

// =============================================
// DASHBOARD & CRM API ROUTES
// =============================================
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/stats', (req, res) => {
  const leads = getAllLeads();
  let totalMessages = 0;

  const counts = {
    total: leads.length,
    newLeads: 0,
    coldLeads: 0,
    warmLeads: 0,
    hotLeads: 0,
    webinarJoined: 0,
    closedSale: 0,
    notInterested: 0
  };

  leads.forEach(l => {
    totalMessages += l.totalMessages;
    const status = l.status || 'New Lead';
    if (status === 'New Lead') counts.newLeads++;
    else if (status === 'Cold Lead') counts.coldLeads++;
    else if (status === 'Warm Lead') counts.warmLeads++;
    else if (status === 'Hot Lead') counts.hotLeads++;
    else if (status === 'Webinar Joined') counts.webinarJoined++;
    else if (status === 'Closed Sale') counts.closedSale++;
    else if (status === 'Not Interested') counts.notInterested++;
    else counts.newLeads++;
  });

  res.json({
    aiEnabled,
    totalLeads: leads.length,
    totalMessages,
    counts,
    leads
  });
});

app.get('/api/lead-history', (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  const record = getLeadRecord(phone);
  res.json({
    history: record.history || [],
    profile: record.profile || {}
  });
});

app.post('/api/update-lead-status', (req, res) => {
  const { phone, status } = req.body;
  if (!phone || !status) return res.status(400).json({ error: 'Phone and status required' });
  updateLeadStatus(phone, status);
  console.log(`🏷️ Updated status for ${phone} to: ${status}`);
  res.json({ success: true, phone, status });
});

app.post('/api/update-lead-profile', (req, res) => {
  const { phone, profile } = req.body;
  if (!phone || !profile) return res.status(400).json({ error: 'Phone and profile required' });
  const updated = updateLeadProfile(phone, profile);
  console.log(`👤 Updated profile for ${phone}`);
  res.json({ success: true, updated });
});

app.post('/api/toggle-ai', (req, res) => {
  aiEnabled = !aiEnabled;
  console.log(`🎛️ AI Agent state changed to: ${aiEnabled ? 'ENABLED' : 'PAUSED'}`);
  res.json({ aiEnabled });
});

// =============================================
// IMPORT BOTBIZ SUBSCRIBERS
// =============================================
app.post('/api/import-subscribers', (req, res) => {
  const { subscribers } = req.body;
  if (!Array.isArray(subscribers)) return res.status(400).json({ error: 'subscribers array required' });

  const { getLeadRecord, saveLeadRecord } = require('./memory');
  let imported = 0, skipped = 0;

  for (const sub of subscribers) {
    const phone = (sub.phone || sub.number || sub.contact || '').toString().replace(/\D/g, '');
    if (!phone || phone.length < 10) { skipped++; continue; }

    const record = getLeadRecord(phone);
    // Only update fields if not already set
    if (!record.leadName || record.leadName === 'Lead') {
      record.leadName = sub.name || sub.first_name || 'Subscriber';
    }
    if (!record.profile.name && (sub.name || sub.first_name)) {
      record.profile.name = sub.name || sub.first_name;
    }
    if (!record.profile.email && sub.email) {
      record.profile.email = sub.email;
      record.email = sub.email;
    }
    if (!record.profile.city && (sub.city || sub.location)) {
      record.profile.city = sub.city || sub.location;
    }
    if (!record.status || record.status === 'New Lead') {
      record.status = sub.status || 'New Lead';
    }
    if (!record.createdAt) record.createdAt = sub.created_at || new Date();
    record.source = 'BotBiz Import';
    saveLeadRecord(phone, record);
    imported++;
    console.log(`📥 Imported subscriber: ${record.leadName} (${phone})`);
  }

  console.log(`✅ Import complete: ${imported} imported, ${skipped} skipped`);
  res.json({ success: true, imported, skipped });
});

// =============================================
// FETCH BOTBIZ SUBSCRIBERS VIA API KEY
// =============================================
app.post('/api/fetch-botbiz', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'BotBiz API key required' });

  try {
    const axios = require('axios');
    const response = await axios.get('https://api.botbiz.com/v1/subscribers', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const subscribers = response.data.subscribers || response.data || [];

    const { getLeadRecord, saveLeadRecord } = require('./memory');
    let imported = 0, skipped = 0;
    for (const sub of subscribers) {
      const phone = (sub.phone || sub.number || sub.contact || '').toString().replace(/\D/g, '');
      if (!phone || phone.length < 10) { skipped++; continue; }
      const record = getLeadRecord(phone);
      if (!record.leadName || record.leadName === 'Lead') record.leadName = sub.name || sub.first_name || 'Subscriber';
      if (!record.profile.name && (sub.name || sub.first_name)) record.profile.name = sub.name || sub.first_name;
      if (!record.profile.email && sub.email) { record.profile.email = sub.email; record.email = sub.email; }
      if (!record.profile.city && (sub.city || sub.location)) record.profile.city = sub.city || sub.location;
      if (!record.status || record.status === 'New Lead') record.status = sub.status || 'New Lead';
      if (!record.createdAt) record.createdAt = sub.created_at || new Date();
      record.source = 'BotBiz API Import';
      saveLeadRecord(phone, record);
      imported++;
    }
    console.log(`✅ BotBiz API import: ${imported} imported, ${skipped} skipped`);
    res.json({ success: true, imported, skipped });
  } catch (err) {
    console.error('❌ BotBiz fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch from BotBiz', details: err.message });
  }
});

// =============================================
// EXPORT CSV
// =============================================
// EXPORT CSV
// =============================================
app.get('/api/export-csv', (req, res) => {
  const leads = getAllLeads();
  const rows = [
    ['Phone', 'Name', 'Email', 'City', 'Age', 'Occupation', 'Budget', 'Status', 'Email Status', 'Source', 'Date']
  ];

  leads.forEach(l => {
    const p = l.profile || {};
    rows.push([
      l.phone, l.leadName || '', p.email || l.email || '', p.city || '',
      p.age || '', p.occupation || '', p.budget || '',
      l.status || 'New Lead', l.welcomeEmailStatus || 'NOT SENT',
      l.source || 'WhatsApp', new Date(l.updatedAt).toLocaleString('en-IN')
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="leads_export.csv"');
  res.send(csv);
});

app.post('/api/send-webinar-now', async (req, res) => {
  const count = await triggerWebinarBlast();
  res.json({ success: true, count });
});

// =============================================
// TEST SIMULATION FOR LEAD 8708538708
// =============================================
app.post('/api/simulate-test-lead', async (req, res) => {
  const testPhone = '918708538708';
  console.log(`\n🧪 [SIMULATION STARTED] Acting as new lead for ${testPhone}...`);

  const testMessages = [
    { text: "Hi bro, main Facebook Ad par click karke aaya hoon. Detail batao?", delay: 1000 },
    { text: "Mera naam Rahul Verma hai, Karnal Haryana se hoon, 22 saal age hai. College student hoon.", delay: 3000 },
    { text: "Mera dream hai financial freedom achieve karna taaki family ko support kar sakoon. Mera budget ₹1600-₹2000 tak hai. Email: rahul.verma@gmail.com", delay: 4000 }
  ];

  for (const item of testMessages) {
    await sleep(item.delay);
    console.log(`📩 [SIMULATED LEAD ${testPhone}]: "${item.text}"`);
    const reply = await handleMessage(testPhone, item.text, 'Rahul Verma', {
      CITY: 'Karnal',
      AGE: '22',
      OCCUPATION: 'Student'
    });
    console.log(`🤖 [AI REPLY]: "${reply?.substring(0, 100)}..."`);
  }

  res.json({ success: true, phone: testPhone, message: 'Simulation completed! Refresh dashboard to see lead qualification profile.' });
});

// Health check
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// =============================================
// CAMPAIGN API ENDPOINTS
// =============================================

// Start Webinar Follow-up Campaign
app.post('/api/start-campaign', async (req, res) => {
  const { limit = 100 } = req.body;
  console.log(`\n🚀 [CAMPAIGN API] Starting webinar campaign for ${limit} leads...`);
  try {
    const count = await startWebinarCampaign(Number(limit));
    res.json({ success: true, message: `Campaign started! Messages sent to ${count} leads.`, count });
  } catch (err) {
    console.error('❌ Campaign error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get Hot Leads (I AM INTERESTED)
app.get('/api/hot-leads', (req, res) => {
  const leads = getAllLeads();
  const hotLeads = leads.filter(l => l.status === 'Hot Lead' || l.profile?.campaignStatus === 'INTERESTED');
  res.json({ count: hotLeads.length, leads: hotLeads });
});

// Reset campaign status for a lead (to resend campaign msg)
app.post('/api/reset-campaign-lead', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  const record = getLeadRecord(phone);
  delete record.campaignStatus;
  record.history = [];
  saveLeadRecord(phone, record);
  res.json({ success: true });
});

// =============================================
// BOTBIZ INCOMING WEBHOOK
// =============================================
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;

    // DEBUG: Log every incoming webhook payload on Render to diagnose format
    console.log('📥 RAW BOTBIZ WEBHOOK PAYLOAD:', JSON.stringify(body));

    // Support ALL possible BotBiz field name variants
    const phone = (
      body.chat_id ||
      body.phone ||
      body.from ||
      body.contact?.phone ||
      body.subscriber?.phone ||
      (body.contact && body.contact.wa_id) ||
      ''
    ).toString().replace(/\D/g, '');

    const text = (
      body.user_message ||
      body.message ||
      body.text ||
      body.body ||
      (body.messages && body.messages[0]?.text?.body) ||
      ''
    );

    const messageId = body.wa_message_id || body.message_id || body.id || null;

    const leadName = (
      body.first_name ||
      body.name ||
      body.contact_name ||
      body.subscriber?.name ||
      body.contact?.name ||
      'Lead'
    );

    const customFields = body.custom_fields || body.fields || {};
    const leadEmail = customFields.EMAIL || customFields.email || body.email || null;

    if (!phone || !text) {
      console.log('⚠️ Webhook missing phone or text — payload was:', JSON.stringify(body));
      return;
    }
    const strText = String(text).trim();
    if (!strText) return;

    if (strText.toUpperCase() === 'STOP' || strText.toUpperCase() === 'UNSUBSCRIBE') {
      unsubscribedLeads.add(phone);
      updateLeadStatus(phone, 'Not Interested');
      if (followUpTimers[phone]) {
        clearTimeout(followUpTimers[phone]);
        delete followUpTimers[phone];
      }
      await sendMessage(phone, "Aapko reminders se unsubscribe kar diya gaya hai. Agar wapas start karna ho toh RESTART message bhejein. Thank you! 🙏");
      console.log(`🛑 Lead ${phone} opted-out (STOP received)`);
      return;
    }

    if (strText.toUpperCase() === 'RESTART') {
      unsubscribedLeads.delete(phone);
      updateLeadStatus(phone, 'New Lead');
      await sendMessage(phone, "Aapka subscription wapas active ho gaya hai! 🎉 Main Yuvin Chauhan aapki help ke liye ready hoon.");
      return;
    }

    if (followUpTimers[phone]) {
      clearTimeout(followUpTimers[phone]);
      delete followUpTimers[phone];
      console.log(`🛑 40-Min Follow-up timer cancelled for ${phone} (User replied)`);
    }

    if (messageId && processedMessages.has(messageId)) return;
    if (messageId) {
      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 3600000);
    }

    const isNewLead = !knownLeads.has(phone);
    knownLeads.set(phone, { leadName, email: leadEmail, lastSeen: new Date() });

    const leadRec = getLeadRecord(phone);
    if (leadEmail && leadRec.welcomeEmailStatus !== 'SENT') {
      console.log(`📧 Sending Welcome Email to ${leadEmail}...`);
      sendWelcomeEmail(leadEmail, leadName);
      leadRec.welcomeEmailStatus = 'SENT';
      saveLeadRecord(phone, leadRec);
    }

    console.log(`\n📩 ${leadName} (${phone}): "${text}"`);

    if (!aiEnabled) {
      console.log('⏸️ AI Agent is PAUSED — skipping automated reply');
      return;
    }

    // Check if this lead is in active campaign — route to campaign handler
    const leadRec2 = getLeadRecord(phone);
    if (leadRec2.campaignStatus && !['NOT_INTERESTED', 'INTERESTED', 'CLOSED'].includes(leadRec2.campaignStatus)) {
      console.log(`🎯 [CAMPAIGN LEAD] Routing ${phone} to campaign handler...`);
      cancelCampaignFollowup(phone);
      await sleep(5000); // 5-sec typing gap
      const campaignResult = await handleCampaignReply(phone, text, leadName);
      console.log(`✅ Campaign reply handled for ${phone}: ${campaignResult}`);
      // Also log to lead history
      leadRec2.history = leadRec2.history || [];
      leadRec2.history.push({ role: 'user', content: text });
      saveLeadRecord(phone, leadRec2);
      return;
    }

    const reply = await handleMessage(phone, text, leadName, customFields);
    if (reply) {
      // 5-Second Typing Delay gap for natural human feel
      console.log(`⏳ [TYPING GAP] Waiting 5 seconds before replying to ${phone}...`);
      await sleep(5000);

      await sendMessage(phone, reply);
      console.log(`✅ WhatsApp Reply bheja to ${phone}: "${reply.substring(0, 100)}..."\n`);

      // 1-Hour (60 Minutes) Automated Follow-up Timer
      followUpTimers[phone] = setTimeout(async () => {
        if (!unsubscribedLeads.has(phone)) {
          const followUpText = `Hi ${leadName || 'Friend'}, 1 ghanta ho gaya aapka reply nahi aaya! 😊 Kya soch rahe ho? Agar course ya earning system se related koi bhi doubt hai toh bejhijhak pucho. Main help karne ke liye taiyar hoon! 🙏\n\n(Reply STOP to unsubscribe anytime)`;
          await sendMessage(phone, followUpText);
          console.log(`⏰ [1-HOUR FOLLOW-UP] Sent to ${phone}`);
        }
        delete followUpTimers[phone];
      }, 60 * 60 * 1000);
    }

  } catch (err) {
    console.error('❌ Webhook error:', err.message);
  }
});

// =============================================
// SCHEDULER
// =============================================
let webinarReminderSentToday = false;

setInterval(async () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);

  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();

  if (hours === 0 && minutes === 0) {
    webinarReminderSentToday = false;
  }

  if (hours === 20 && minutes === 0 && !webinarReminderSentToday) {
    webinarReminderSentToday = true;
    await triggerWebinarBlast();
  }
}, 60000);

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🤖 WhatsApp AI CRM Command Center   ║
╠════════════════════════════════════════╣
║  Port          : ${PORT}                      ║
║  Dashboard     : http://localhost:${PORT}/  ║
║  Webhook       : POST /webhook             ║
║  Follow-Up     : 40 Minutes ⏱️              ║
║  Webinar Alert : 8 PM Daily 🔴             ║
║  Status        : LIVE ✅                   ║
╚════════════════════════════════════════╝
  `);
});
