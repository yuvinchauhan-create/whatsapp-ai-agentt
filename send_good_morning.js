require('dotenv').config();
const { getAllLeads } = require('./memory');
const { sendMessage } = require('./whatsapp');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendRandomGoodMorning() {
  const allLeads = getAllLeads();

  // Filter out unsubscribed / invalid leads
  const eligibleLeads = allLeads.filter(l => {
    if (!l.phone || l.phone.length < 10) return false;
    if (l.status === 'Not Interested') return false;
    return true;
  });

  if (eligibleLeads.length === 0) {
    console.log("No eligible leads found.");
    return;
  }

  // Shuffle array using Fisher-Yates
  const shuffled = [...eligibleLeads];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Pick top 10
  const selected10 = shuffled.slice(0, 10);

  console.log(`\n🚀 Sending Good Morning message to 10 random leads out of ${eligibleLeads.length} total...\n`);

  let count = 0;
  for (const lead of selected10) {
    const name = (lead.leadName && lead.leadName !== 'Lead' && lead.leadName !== 'Subscriber') 
      ? ` ${lead.leadName}` 
      : '';
    const text = `Good morning${name}! 👋 Kaise ho aap?`;

    console.log(`📲 Sending [${count + 1}/10] to +${lead.phone} (${name.trim() || 'Friend'})...`);
    const res = await sendMessage(lead.phone, text);

    if (res) {
      count++;
    }

    // Safety delay of 2 seconds between messages
    await sleep(2000);
  }

  console.log(`\n🎉 Completed! Sent Good Morning message to ${count} leads.`);
}

sendRandomGoodMorning();
