// memory.js — Lead Memory, Status Tags & Conversation History
const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, 'conversations');

if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function clearAllConversations() {
  if (fs.existsSync(MEMORY_DIR)) {
    const files = fs.readdirSync(MEMORY_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(MEMORY_DIR, file));
      }
    }
    console.log('🧹 [CLEANUP] Deleted all previous dummy conversation files.');
  }
}

function getLeadRecord(phone) {
  const filePath = path.join(MEMORY_DIR, `${phone}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) {
        return {
          phone,
          leadName: 'Lead',
          status: 'New Lead',
          welcomeEmailStatus: 'NOT SENT',
          profile: {
            name: '',
            age: '',
            city: '',
            occupation: '',
            qualification: '',
            budget: '',
            reason: '',
            dream: '',
            email: ''
          },
          createdAt: fs.statSync(filePath).birthtime || new Date(),
          updatedAt: fs.statSync(filePath).mtime || new Date(),
          history: data
        };
      }
      if (!data.profile) {
        data.profile = {
          name: data.leadName || '',
          age: '',
          city: '',
          occupation: '',
          qualification: '',
          budget: '',
          reason: '',
          dream: '',
          email: data.email || ''
        };
      }
      if (!data.welcomeEmailStatus) {
        data.welcomeEmailStatus = 'NOT SENT';
      }
      return data;
    } catch {
      return createEmptyRecord(phone);
    }
  }
  return createEmptyRecord(phone);
}

function createEmptyRecord(phone) {
  return {
    phone,
    leadName: 'Lead',
    status: 'New Lead',
    welcomeEmailStatus: 'NOT SENT',
    profile: {
      name: '',
      age: '',
      city: '',
      occupation: '',
      qualification: '',
      budget: '',
      reason: '',
      dream: '',
      email: ''
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    history: []
  };
}

function saveLeadRecord(phone, record) {
  const filePath = path.join(MEMORY_DIR, `${phone}.json`);
  record.updatedAt = new Date();
  if (record.history) {
    record.history = record.history.slice(-30);
  }
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
}

function getHistory(phone) {
  const record = getLeadRecord(phone);
  return record.history || [];
}

function updateLeadStatus(phone, newStatus) {
  const record = getLeadRecord(phone);
  record.status = newStatus;
  saveLeadRecord(phone, record);
}

function updateLeadProfile(phone, profileUpdates = {}) {
  const record = getLeadRecord(phone);
  record.profile = { ...record.profile, ...profileUpdates };
  if (profileUpdates.name && profileUpdates.name.length > 2) record.leadName = profileUpdates.name;
  if (profileUpdates.email) record.email = profileUpdates.email;
  saveLeadRecord(phone, record);
  return record;
}

function getAllLeads() {
  if (!fs.existsSync(MEMORY_DIR)) return [];
  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));

  return files.map(file => {
    const phone = file.replace('.json', '');
    const record = getLeadRecord(phone);
    const history = record.history || [];
    const lastMsgObj = history.length > 0 ? history[history.length - 1] : null;

    return {
      phone: record.phone || phone,
      leadName: record.leadName || record.profile?.name || 'Lead',
      email: record.profile?.email || record.email || null,
      status: record.status || 'New Lead',
      welcomeEmailStatus: record.welcomeEmailStatus || 'NOT SENT',
      profile: record.profile || {},
      createdAt: record.createdAt || new Date(),
      updatedAt: record.updatedAt || new Date(),
      totalMessages: history.length,
      lastMessage: lastMsgObj ? lastMsgObj.content : 'No messages',
      lastSender: lastMsgObj ? lastMsgObj.role : 'system'
    };
  }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

module.exports = {
  getHistory,
  getLeadRecord,
  saveLeadRecord,
  updateLeadStatus,
  updateLeadProfile,
  getAllLeads,
  clearAllConversations
};
