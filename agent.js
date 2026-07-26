// agent.js — Groq AI (FREE 14K req/day) + Auto Intent Labeling + Accurate Profile Collector
const axios = require('axios');
const { getLeadRecord, saveLeadRecord } = require('./memory');
const { getSystemPrompt } = require('./persona');
const { sendWelcomeEmail } = require('./email');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

function extractProfileDetails(userMessage, currentProfile = {}) {
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();
  const updates = {};

  // 1. Email Extraction
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const emailMatch = msg.match(emailRegex);
  if (emailMatch) {
    updates.email = emailMatch[0];
  }

  // 2. City Extraction
  const cityMatch = lower.match(/city\s*([a-zA-Z]+)/) || lower.match(/from\s*([a-zA-Z]+)/) || lower.match(/([a-zA-Z]+)\s*se\b/);
  if (cityMatch && cityMatch[1]) {
    const rawCity = cityMatch[1].trim();
    if (rawCity.length > 2 && !['hoon', 'hu', 'se', 'me', 'bhi', 'hai'].includes(rawCity)) {
      updates.city = rawCity.charAt(0).toUpperCase() + rawCity.slice(1);
    }
  }

  // 3. Name Extraction
  const nameMatch = lower.match(/(?:mera naam|my name is|i am|name)\s+([a-zA-Z]+)/);
  if (nameMatch && nameMatch[1]) {
    const rawName = nameMatch[1].trim();
    if (rawName.length > 2) {
      updates.name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    }
  } else if (!currentProfile.name || currentProfile.name === 'Lead') {
    if (/^[a-zA-Z]{3,15}$/.test(msg) && !['hello', 'hi', 'bhai', 'bro', 'study', 'job', 'paid', 'yes', 'no'].includes(lower)) {
      updates.name = msg.charAt(0).toUpperCase() + msg.slice(1);
    }
  }

  // 4. Age Extraction
  const ageMatch = lower.match(/(\d{2})\s*(years|yr|yrs|saal|sal|age)/) || lower.match(/age\s*(\d{2})/);
  if (ageMatch) {
    updates.age = ageMatch[1];
  }

  // 5. Budget Extraction
  if (lower.includes('budget') || lower.includes('rs') || lower.includes('₹') || lower.includes('rupay') || lower.includes('inr')) {
    const budgetMatch = lower.match(/(\d{3,5})/);
    if (budgetMatch) {
      updates.budget = `₹${budgetMatch[1]}`;
    }
  }

  // 6. Occupation
  if (lower.includes('student') || lower.includes('study') || lower.includes('college') || lower.includes('school')) {
    updates.occupation = 'Student';
  } else if (lower.includes('job') || lower.includes('working') || lower.includes('private')) {
    updates.occupation = 'Job / Employee';
  } else if (lower.includes('housewife') || lower.includes('home')) {
    updates.occupation = 'Housewife';
  } else if (lower.includes('business') || lower.includes('shop')) {
    updates.occupation = 'Business';
  }

  // 7. Dreams
  if (lower.includes('paisa') || lower.includes('earn') || lower.includes('financial') || lower.includes('freedom') || lower.includes('help family') || lower.includes('skills')) {
    updates.dream = msg.length < 80 ? msg : 'Financial Freedom & Skills Growth';
  }

  return updates;
}

function detectIntentStatus(userMessage, currentStatus) {
  const msg = userMessage.toLowerCase().trim();

  if (msg.includes('paid') || msg.includes('payment done') || msg.includes('screenshot') || msg.includes('transfer kar diya')) {
    return 'Closed Sale';
  }
  if (msg.includes('emi') || msg.includes('pay') || msg.includes('book') || msg.includes('link bhej') || msg.includes('account detail')) {
    return 'Hot Lead';
  }
  if (msg.includes('package') || msg.includes('price') || msg.includes('detail') || msg.includes('course') || msg.includes('batao')) {
    return currentStatus === 'New Lead' ? 'Warm Lead' : currentStatus;
  }
  if (msg.includes('not interested') || msg.includes('no') || msg.includes('mat karo') || msg.includes('stop')) {
    return 'Not Interested';
  }

  return currentStatus || 'New Lead';
}

async function handleMessage(phone, userMessage, leadName = '', customFields = {}) {
  try {
    const record = getLeadRecord(phone);
    const history = record.history || [];

    history.push({ role: 'user', content: userMessage });

    // Extract Profile & Intent
    const profileUpdates = extractProfileDetails(userMessage, record.profile);

    if (customFields["FULL NAME"] && customFields["FULL NAME"].length > 2) {
      profileUpdates.name = customFields["FULL NAME"];
    }
    if (customFields["CITY STATE"] && customFields["CITY STATE"].length > 2) {
      profileUpdates.city = customFields["CITY STATE"];
    }
    if (customFields["OCCUPATION"] && customFields["OCCUPATION"].length > 2) {
      profileUpdates.occupation = customFields["OCCUPATION"];
    }

    record.profile = { ...record.profile, ...profileUpdates };
    
    if (record.profile.name && record.profile.name !== 'Lead') {
      record.leadName = record.profile.name;
    }
    if (record.profile.email) {
      record.email = record.profile.email;
    }

    // ✅ Send Welcome Email ONLY ONCE per user when email is first detected
    const emailInMessage = profileUpdates.email || record.profile.email;
    if (emailInMessage && record.welcomeEmailStatus !== 'SENT') {
      console.log(`📧 [WELCOME EMAIL TRIGGER] Sending Welcome Email to ${emailInMessage} for ${record.leadName}...`);
      const emailResult = await sendWelcomeEmail(emailInMessage, record.leadName || 'Friend');
      if (emailResult.success) {
        record.welcomeEmailStatus = 'SENT';
        record.welcomeEmailSent = true;
      } else {
        record.welcomeEmailStatus = `FAILED (${emailResult.error})`;
      }
    }

    const { detectGender, getRespectfulSalutation } = require('./gender');
    const gender = record.profile.gender || detectGender(record.profile.name || record.leadName || leadName);
    record.profile.gender = gender;
    const salutation = getRespectfulSalutation(gender, record.leadName || record.profile.name);

    record.status = detectIntentStatus(userMessage, record.status);

    console.log(`🤖 Groq AI processing for ${record.leadName} (${phone}) [Gender: ${gender.toUpperCase()}]...`);

    let leadContext = `
LEAD QUALIFICATION PROFILE & RESPECT RULES:
- Name: ${record.profile.name || record.leadName || 'Not known'}
- Gender: ${gender.toUpperCase()}
- Address As: "${salutation}"
${gender === 'female' ? '⚠️ CRITICAL RULE: THIS LEAD IS FEMALE! Never use "bhai", "bro", "bro/bhai", "bhai/mam", or male slang! Address her ONLY as "Mam", "' + (record.leadName || 'Lead') + ' ji", or "Di"!' : ''}
${gender === 'male' ? '- Address as "bhai", "bro", or "' + (record.leadName || 'Lead') + ' bhai".' : ''}
- Age: ${record.profile.age || 'Not known'}
- City: ${record.profile.city || 'Not known'}
- Occupation: ${record.profile.occupation || 'Not known'}
- Qualification: ${record.profile.qualification || 'Not known'}
- Budget: ${record.profile.budget || 'Not known'}
- Dream / Reason: ${record.profile.dream || 'Not known'}
- Email: ${record.profile.email || 'Not known'}
    `;

    const systemPrompt = getSystemPrompt() + `\n\n${leadContext}`;

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    console.log(`🤖 Groq AI reply generating for ${phone}...`);

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history
        ],
        max_tokens: 300,
        temperature: 0.85
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    console.log(`✅ Groq reply received for ${phone}`);

    let reply = response.data.choices[0].message.content.trim();

    // 1. Remove XML/HTML style reasoning tags like <think>...</think> or <thought>...</thought>
    reply = reply.replace(/<(think|thought|reasoning)>[\s\S]*?<\/\1>/gi, '').trim();

    // 2. Remove lines starting with "User Safety:", "Response Safety:", "Note:", "Thinking:"
    const lines = reply.split('\n');
    const cleanLines = lines.filter(line => {
      const l = line.trim().toLowerCase();
      if (l.startsWith('user safety:') || l.startsWith('response safety:') || l.startsWith('note:') || l.startsWith('thinking:')) return false;
      if (l.startsWith('we need to respond') || l.startsWith('the user is asking') || l.startsWith('okay, let me')) return false;
      return true;
    });

    reply = cleanLines.join('\n').trim();

    // 3. Fallback: If reply still has double breaks after meta header, take last section
    if (reply.includes('\n\n')) {
      const sections = reply.split('\n\n');
      const lastSection = sections[sections.length - 1].trim();
      if (lastSection.length > 5 && !lastSection.toLowerCase().includes('user safety:')) {
        reply = lastSection;
      }
    }

    history.push({ role: 'assistant', content: reply });
    record.history = history;
    saveLeadRecord(phone, record);

    return reply;

  } catch (err) {
    console.error('❌ DeepSeek error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { handleMessage };
