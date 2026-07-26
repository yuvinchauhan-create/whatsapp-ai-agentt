// whatsapp.js — BotBiz API se message bhejta hai
const axios = require('axios');

const BOTBIZ_API_KEY = process.env.BOTBIZ_API_KEY;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const BOTBIZ_API_URL = 'https://dash.botbiz.io/api/v1/whatsapp/send';

// Lead ko message bhejo (BotBiz API ke zariye)
async function sendMessage(to, text) {
  try {
    const response = await axios.post(
      BOTBIZ_API_URL,
      {
        apiToken: BOTBIZ_API_KEY,
        phone_number_id: PHONE_NUMBER_ID,
        phone_number: to,
        message: text
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    console.log('✅ BotBiz se message gaya:', response.data?.message || 'OK');
    return response.data;
  } catch (err) {
    console.error('❌ BotBiz send error:', err.response?.data || err.message);
    return null;
  }
}

// Placeholder — BotBiz auto-marks read
async function markAsRead(messageId) {
  // BotBiz khud handle karta hai
}

module.exports = { sendMessage, markAsRead };
