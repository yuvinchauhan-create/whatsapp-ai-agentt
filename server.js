// server.js — BotBiz webhook handler + Dashboard + Qualification Profile + Campaign Engine
require('dotenv').config();
const express = require('express');
const path = require('path');
const { handleMessage } = require('./agent');
const { sendMessage } = require('./whatsapp');
const { sendWelcomeEmail, sendWebinarReminderEmail } = require('./email');
const { getHistory, getAllLeads, updateLeadStatus, updateLeadProfile, getLeadRecord, saveLeadRecord } = require('./memory');
const { startWebinarCampaign, handleCampaignReply, cancelCampaignFollowup } = require('./campaign');
const { schedulePerLeadFollowup, cancelPerLeadFollowup } = require('./followup_scheduler');
const { startManager } = require('./manager');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Start the Manager Tool
startManager();

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

global.debugLogs = [];
function addLog(msg) {
  const ts = new Date().toISOString();
  console.log(msg);
  global.debugLogs.unshift(`[${ts}] ${msg}`);
  if (global.debugLogs.length > 50) global.debugLogs.pop();
}

let last759RunDate = '';

let broadcastTracker = {
  isRunning: false,
  startTime: null,
  endTime: null,
  totalTarget: 0,
  sentCount: 0,
  pendingCount: 0,
  skippedCount: 0,
  failedCount: 0,
  leadDetails: []
};

// =============================================
// REFINED 7:59 PM DAILY WEBINAR REMINDER BROADCAST
// =============================================
function get759ReminderMsg(leadName) {
  const nameStr = leadName && leadName !== 'Lead' && leadName !== 'Subscriber' ? ` ${leadName}` : '';
  return `🚨 *LAST REMINDER: 8:00 PM MEETING START HONE WALA HAI!* 🚀

Namaste${nameStr}! 🙏

Aaj raat *8:00 PM* ko hamara Special Live Workshop start hone wala hai jisme A to Z poora business aur earning process samjhaya jayega!

👉 *Agar abhi tak WhatsApp Community join nahi kiya hai, toh abhi JOIN karo:*
https://chat.whatsapp.com/GnC3hTbpeT4AR3DsgANnBp
*(Meeting ka Zoom link issi group mein aayega — Join Fast! ⚡)*

💬 *Agar aap pehle se Community mein ho:*
Toh abhi Community message check kijiye, meeting link bhej diya gaya hai! Join karke poora kaam samjhiye.

💡 *Agar aapne pehle Webinar dekh liya hai:*
Toh apna time waste mat kijiye! Apne doubts clear karne ke liye mujhe *ABHI CALL KARO: 9217958980* aur aaj hi apna business & daily earning start karo! 🔥

— Yuvin Chauhan | LeadsGuru Top Affiliate`;
}

async function triggerDaily759Broadcast() {
  if (broadcastTracker.isRunning) {
    console.log('⚠️ Broadcast already in progress — skipping duplicate trigger');
    return broadcastTracker.sentCount;
  }

  const leads = getAllLeads();
  console.log(`\n📢 [7:59 PM DAILY BROADCAST STARTED] Broadcasting to ${leads.length} leads...`);

  broadcastTracker = {
    isRunning: true,
    startTime: new Date(),
    endTime: null,
    totalTarget: leads.length,
    sentCount: 0,
    pendingCount: leads.length,
    skippedCount: 0,
    failedCount: 0,
    leadDetails: leads.map(l => ({
      phone: l.phone,
      name: l.leadName || 'Lead',
      status: 'PENDING',
      sentAt: null,
      error: null
    }))
  };

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const detail = broadcastTracker.leadDetails[i];

    if (unsubscribedLeads.has(lead.phone) || lead.status === 'Not Interested' || lead.aiDisabled) {
      detail.status = 'SKIPPED';
      detail.error = 'Unsubscribed or Not Interested';
      broadcastTracker.skippedCount++;
      broadcastTracker.pendingCount--;
      continue;
    }

    const msg = get759ReminderMsg(lead.leadName);

    try {
      const res = await sendMessage(lead.phone, msg);
      if (res && (res.status === 'success' || res.message?.includes('success') || res.status === 200 || res.id)) {
        detail.status = 'SENT';
        detail.sentAt = new Date();
        broadcastTracker.sentCount++;
        console.log(`✅ [7:59 PM REMINDER] Sent to ${lead.leadName} (${lead.phone})`);
      } else {
        detail.status = 'SKIPPED';
        detail.error = res?.message || 'Outside 24h Window';
        broadcastTracker.skippedCount++;
        console.log(`⏭️ [7:59 PM REMINDER] Skipped ${lead.leadName} (${lead.phone}): Outside 24h Window`);
      }
    } catch (err) {
      detail.status = 'FAILED';
      detail.error = err.message;
      broadcastTracker.failedCount++;
      console.error(`❌ Failed 7:59 PM reminder to ${lead.phone}:`, err.message);
    }
    broadcastTracker.pendingCount--;

    await sleep(1500); // 1.5s gap between sends
  }

  broadcastTracker.isRunning = false;
  broadcastTracker.endTime = new Date();
  console.log(`\n🎉 [7:59 PM DAILY BROADCAST COMPLETE] Sent to ${broadcastTracker.sentCount} leads!`);
  return broadcastTracker.sentCount;
}

// Check every 60 seconds if current time is 7:59 PM IST (19:59)
setInterval(() => {
  const now = new Date();
  // Format IST time
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
  
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const dateStr = istDate.toISOString().split('T')[0];

  if (hours === 19 && minutes === 59 && last759RunDate !== dateStr) {
    last759RunDate = dateStr;
    console.log(`⏰ [7:59 PM CRON TRIGGERED] Running daily 7:59 PM webinar broadcast for date: ${dateStr}`);
    triggerDaily759Broadcast();
  }
}, 60000);

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
// TEST API ROUTE (FOR LIVE DEBUGGING)
// =============================================
app.get('/test-api', async (req, res) => {
  try {
    let result = { 
      openRouter: 'not tested', 
      botbiz: 'not tested', 
      env: {
        hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
        hasGroqKey: !!process.env.GROQ_API_KEY,
        hasBotbizKey: !!process.env.BOTBIZ_API_KEY
      }
    };

    // 1. Test AI Generation
    const axios = require('axios');
    const API_KEY = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;
    const isGroq = !process.env.OPENROUTER_API_KEY && process.env.GROQ_API_KEY;
    const API_URL = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const MODEL = isGroq ? 'llama-3.1-8b-instant' : (process.env.OPENROUTER_MODEL || 'google/gemma-2-27b-it');

    try {
      const aiRes = await axios.post(API_URL, {
        model: MODEL,
        messages: [{ role: 'user', content: 'Say word OK' }],
        max_tokens: 10
      }, { headers: { Authorization: `Bearer ${API_KEY}` } });
      result.openRouter = { status: 'Success', response: aiRes.data.choices[0].message.content };
    } catch (e) {
      result.openRouter = { status: 'Failed', error: e.response?.data || e.message };
    }

    // 2. Test BotBiz Sending
    const BOTBIZ_API_KEY = process.env.BOTBIZ_API_KEY;
    try {
      const botbizRes = await axios.post('https://dash.botbiz.io/api/v1/whatsapp/send', {
        number: "918796136115",
        type: "text",
        message: "Test message from API Debugger",
        instance_id: "677FA09C87F7D"
      }, { headers: { 'Authorization': `Bearer ${BOTBIZ_API_KEY}`, 'Content-Type': 'application/json' } });
      result.botbiz = { status: 'Success', data: botbizRes.data };
    } catch (e) {
      result.botbiz = { status: 'Failed', error: e.response?.data || e.message };
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// =============================================
// CAMPAIGN API ENDPOINTS
// =============================================

// Start Webinar Follow-up Campaign (Non-blocking background runner)
app.post('/api/start-campaign', (req, res) => {
  const { limit = 100 } = req.body;
  console.log(`\n🚀 [CAMPAIGN API] Launching webinar campaign asynchronously for ${limit} leads...`);
  res.json({ success: true, message: `Campaign launched in background for up to ${limit} leads!` });
  startWebinarCampaign(Number(limit)).catch(err => console.error('❌ Campaign background error:', err.message));
});

// Trigger 7:59 PM Daily Broadcast Manually Anytime
app.post('/api/trigger-759-broadcast', (req, res) => {
  console.log(`\n📢 [API TRIGGER] Launching 7:59 PM Daily Broadcast asynchronously...`);
  res.json({ success: true, message: '7:59 PM Daily Broadcast launched in background!' });
  triggerDaily759Broadcast().catch(err => console.error('❌ Broadcast background error:', err.message));
});

// Get 8 PM Broadcast Live Tracker Stats
app.get('/api/broadcast-tracker-stats', (req, res) => {
  res.json(broadcastTracker);
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
app.all('/webhook', async (req, res) => {
  addLog(`📥 [${req.method}] RAW BOTBIZ WEBHOOK PAYLOAD: ` + JSON.stringify(req.body || req.query));
  res.sendStatus(200);

  if (req.method !== 'POST') return; // Only process POST requests further

  try {
    const body = req.body;

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

    const upperText = strText.toUpperCase();
    const isStopWord = upperText === 'STOP' || upperText === 'UNSUBSCRIBE' || upperText.includes('NOT INTERESTED') || upperText.includes('NAHI KARNA') || upperText.includes('IRRITATE') || upperText.includes('DON\'T MSG') || upperText.includes('MAT KARO MSG');

    if (isStopWord) {
      const record = getLeadRecord(phone);
      record.aiDisabled = true; // Turn OFF AI agent for THIS specific lead only
      record.status = 'Not Interested';
      saveLeadRecord(phone, record);
      updateLeadStatus(phone, 'Not Interested');
      cancelPerLeadFollowup(phone);

      await sendMessage(phone, "Okay! Thank you. Aapko ab message nahi aayega. Good luck! 😊");
      console.log(`🛑 AI Agent turned OFF for lead ${phone} (Opted out / STOP received)`);
      return;
    }

    if (upperText === 'RESTART' || upperText === 'START') {
      const record = getLeadRecord(phone);
      record.aiDisabled = false; // Turn AI BACK ON if requested
      record.status = 'New Lead';
      saveLeadRecord(phone, record);
      updateLeadStatus(phone, 'New Lead');
      await sendMessage(phone, "Aapka subscription wapas active ho gaya hai! 🎉 Main Yuvin Chauhan aapki help ke liye ready hoon.");
      return;
    }

    if (followUpTimers[phone]) {
      clearTimeout(followUpTimers[phone]);
      delete followUpTimers[phone];
    }
    cancelPerLeadFollowup(phone); // Cancel per-lead smart timer on reply

    if (messageId && processedMessages.has(messageId)) return;
    if (messageId) {
      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 3600000);
    }

    const leadRec = getLeadRecord(phone);

    // PREVENT RAPID MULTIPLE REPLIES (Wait until previous message is done)
    if (leadRec.isProcessing) {
      console.log(`⏳ Lead ${phone} is already being processed. Stacking message into history and skipping duplicate AI call.`);
      leadRec.history = leadRec.history || [];
      leadRec.history.push({ role: 'user', content: text });
      saveLeadRecord(phone, leadRec);
      return;
    }
    leadRec.isProcessing = true;
    saveLeadRecord(phone, leadRec);

    const isNewLead = !knownLeads.has(phone);
    knownLeads.set(phone, { leadName, email: leadEmail, lastSeen: new Date() });

    const nowTime = new Date();
    leadRec.lastUserMsgAt = nowTime;
    leadRec.windowExpiresAt = new Date(nowTime.getTime() + (24 * 60 * 60 * 1000)); // 24 Hours window
    saveLeadRecord(phone, leadRec);

    if (leadEmail && leadRec.welcomeEmailStatus !== 'SENT') {
      console.log(`📧 Sending Welcome Email to ${leadEmail}...`);
      sendWelcomeEmail(leadEmail, leadName);
      leadRec.welcomeEmailStatus = 'SENT';
      saveLeadRecord(phone, leadRec);
    }

    console.log(`\n📩 ${leadName} (${phone}): "${text}"`);

    if (!aiEnabled) {
      addLog('⏸️ AI Agent is PAUSED — skipping automated reply');
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
      schedulePerLeadFollowup(phone); // Schedule smart per-lead followup
      return;
    }

    const reply = await handleMessage(phone, text, leadName, customFields);
    if (reply) {
      addLog(`🧠 AI GENERATED REPLY: ${reply.substring(0, 100)}...`);
      // Dynamic 5 to 8 Seconds Typing Delay gap for natural human feel
      const typingMs = Math.floor(Math.random() * 3000) + 5000; // 5000ms - 8000ms
      addLog(`⏳ Waiting ${(typingMs/1000).toFixed(1)}s before replying...`);
      await sleep(typingMs);

      const sendRes = await sendMessage(phone, reply);
      if (sendRes) {
        addLog(`✅ WhatsApp Send Success: ${JSON.stringify(sendRes)}`);
      } else {
        addLog(`❌ WhatsApp Send FAILED (check console)`);
      }

      // Schedule smart 3-stage per-lead dynamic followups (20m, 1h, 4h)
      schedulePerLeadFollowup(phone);
    } else {
      addLog(`🚨 AI Generated NULL reply for ${phone}. Check API keys or errors.`);
    }

    // UNLOCK PROCESSING
    const finalRec = getLeadRecord(phone);
    finalRec.isProcessing = false;
    saveLeadRecord(phone, finalRec);

  } catch (err) {
    addLog(`❌ Webhook error: ${err.message}`);
    console.error('❌ Webhook error:', err.message);
    
    // UNLOCK PROCESSING ON ERROR
    try {
      const body = req.body;
      const phone = (body.chat_id || body.phone || body.from || '').toString().replace(/\D/g, '');
      if (phone) {
        const finalRec = getLeadRecord(phone);
        finalRec.isProcessing = false;
        saveLeadRecord(phone, finalRec);
      }
    } catch(e) {}
  }
});

// =============================================
// START FOLLOWUPS FOR ALL LEADS
// =============================================
app.get('/api/start-followups', (req, res) => {
  const leads = getAllLeads();
  let count = 0;
  leads.forEach(lead => {
    if (lead.phone && !lead.aiDisabled && lead.status !== 'Closed Sale') {
      schedulePerLeadFollowup(lead.phone);
      count++;
    }
  });
  res.json({ success: true, message: `Follow-ups started for ${count} leads.` });
});

// =============================================
// DEBUG LOGS ENDPOINT
// =============================================
app.get('/api/logs', (req, res) => {
  res.json({ logs: global.debugLogs });
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
