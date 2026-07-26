const fs = require('fs');
const path = require('path');
const { getLeadRecord, saveLeadRecord } = require('./memory');

// Robust CSV parser
function parseCSV(text) {
  const lines = [];
  let curLine = [];
  let curField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        curField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      curLine.push(curField.trim());
      curField = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      curLine.push(curField.trim());
      if (curLine.some(f => f.length > 0)) {
        lines.push(curLine);
      }
      curLine = [];
      curField = '';
    } else {
      curField += c;
    }
  }
  if (curField || curLine.length > 0) {
    curLine.push(curField.trim());
    lines.push(curLine);
  }
  return lines;
}

const csvPath = path.join(__dirname, 'botbiz_subscribers.csv');
if (!fs.existsSync(csvPath)) {
  console.error("botbiz_subscribers.csv file not found!");
  process.exit(1);
}

const text = fs.readFileSync(csvPath, 'utf8');
const rows = parseCSV(text);

console.log(`Total CSV rows parsed: ${rows.length}`);

// Header:
// 0: #
// 1: Phone Number
// 2: Subscriber ID
// 3: Email
// 4: Name
// 5: Last Name
// 6: Label Name
// 7: Subscribe Status
// 8: Subscribed at
// 9: Updated at
// 10: calendly leads
// 11: CITY STATE
// 12: FULL NAME
// 13: full name 22 july
// 14: LEAD KA BUDGET
// 15: OCCUPATION
// 16: test ingnore
// 17: Welcome msg send done

let importedCount = 0;
let skippedCount = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || row.length < 2) continue;

  let rawPhone = row[1] || '';
  const phone = rawPhone.replace(/\D/g, '');

  if (!phone || phone.length < 10) {
    skippedCount++;
    continue;
  }

  const record = getLeadRecord(phone);

  const email = row[3] || null;
  const name = row[4] || row[12] || row[13] || null;
  const cityState = row[11] || null;
  const budget = row[14] || null;
  const occupation = row[15] || null;
  const subscribeStatus = row[7] || 'Subscribed';
  const subscribedAt = row[8] ? new Date(row[8]) : new Date();

  // Helper to clean dummy noise
  function isCleanName(val) {
    if (!val) return false;
    val = val.trim();
    if (val.length <= 2) return false;
    if (['hddddddd', 'null', 'undefined', 'test'].includes(val.toLowerCase())) return false;
    return true;
  }

  function isCleanCity(val) {
    if (!val) return false;
    val = val.trim();
    if (val.length <= 2) return false;
    if (['hddddddd', 'null', 'undefined'].includes(val.toLowerCase())) return false;
    return true;
  }

  // Update record fields intelligently without overwriting existing rich data
  if (isCleanName(name) && (record.leadName === 'Lead' || record.leadName === 'Subscriber' || !record.leadName)) {
    record.leadName = name.trim();
    record.profile.name = name.trim();
  }

  if (email && !record.profile.email) {
    record.profile.email = email.trim();
    record.email = email.trim();
  }

  if (isCleanCity(cityState) && !record.profile.city) {
    record.profile.city = cityState.trim();
  }

  if (budget && budget !== '06268' && !record.profile.budget) {
    record.profile.budget = budget.trim();
  }

  if (occupation && !record.profile.occupation) {
    record.profile.occupation = occupation.trim();
  }

  if (subscribeStatus === 'Unsubscribed') {
    record.status = 'Not Interested';
  } else if (!record.status || record.status === 'New Lead') {
    record.status = 'New Lead';
  }

  record.source = 'BotBiz CSV Import';
  record.createdAt = record.createdAt || subscribedAt;

  saveLeadRecord(phone, record);
  importedCount++;
}

console.log(`🎉 IMPORT COMPLETE!`);
console.log(`✅ Imported/Updated Leads: ${importedCount}`);
console.log(`⏭️ Skipped Rows (invalid phone): ${skippedCount}`);
