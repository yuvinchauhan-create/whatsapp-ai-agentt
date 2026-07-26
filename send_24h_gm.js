require('dotenv').config();
const { getAllLeads } = require('./memory');
const { sendMessage } = require('./whatsapp');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function send24hGoodMorning() {
  const allLeads = getAllLeads();
  const excludedPhones = ['919811715660', '9811715660', '918920915276', '8920915276'];

  const now = new Date();
  
  // Filter leads inside 24h window
  let active24hLeads = allLeads.filter(l => {
    if (!l.phone) return false;
    const cleanPhone = l.phone.replace(/\D/g, '');
    if (excludedPhones.includes(cleanPhone) || excludedPhones.includes(l.phone)) return false;
    if (l.status === 'Not Interested') return false;

    const diffHours = (now - new Date(l.updatedAt)) / (1000 * 3600);
    return diffHours <= 24;
  });

  console.log(`Found ${active24hLeads.length} leads updated in last 24 hours (excluding 9811715660 and 8920915276).`);

  // If active 24h leads are less than 10, pick the most recent ones overall excluding the 2 blocked numbers
  if (active24hLeads.length < 10) {
    console.log("Fewer than 10 active 24h leads found, pulling most recent active leads to reach 10...");
    const additional = allLeads.filter(l => {
      const cleanPhone = (l.phone || '').replace(/\D/g, '');
      if (excludedPhones.includes(cleanPhone) || excludedPhones.includes(l.phone)) return false;
      if (l.status === 'Not Interested') return false;
      return !active24hLeads.some(a => a.phone === l.phone);
    });
    active24hLeads = active24hLeads.concat(additional.slice(0, 10 - active24hLeads.length));
  }

  const selectedLeads = active24hLeads.slice(0, 10);

  console.log(`\n🚀 Sending Good Morning message to ${selectedLeads.length} leads...\n`);

  let successCount = 0;
  for (let i = 0; i < selectedLeads.length; i++) {
    const lead = selectedLeads[i];
    const name = (lead.leadName && lead.leadName !== 'Lead' && lead.leadName !== 'Subscriber') 
      ? ` ${lead.leadName}` 
      : '';
    const text = `Good morning ji${name}! 👋 Kaise ho aap?`;

    console.log(`📲 Sending [${i + 1}/${selectedLeads.length}] to +${lead.phone} (${name.trim() || 'Friend'})...`);
    const res = await sendMessage(lead.phone, text);

    if (res && res.message !== 'Sending message outside 24 hour window is not allowed.') {
      successCount++;
    }

    await sleep(2000);
  }

  console.log(`\n🎉 Broadcast Finished! Successfully sent to ${successCount} leads.`);
}

send24hGoodMorning();
