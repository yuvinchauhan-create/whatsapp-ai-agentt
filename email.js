// email.js — Gmail SMTP via Nodemailer (100% Direct Inbox Delivery)
require('dotenv').config();
const nodemailer = require('nodemailer');

// Create Gmail SMTP Transporter
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

/**
 * Send Welcome Email to new lead
 */
async function sendWelcomeEmail(toEmail, leadName = 'Friend') {
  if (!toEmail) return { success: false, error: 'No email provided' };

  const subject = `🎉 Welcome to Youwin Club Academy! - Yuvin Chauhan`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 24px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; background: #ffffff;">
      <h2 style="color: #4CAF50; margin-top: 0;">Welcome to Youwin Club Academy, ${leadName}! 👋</h2>
      <p style="font-size: 15px; line-height: 1.6;">Main <b>Yuvin Chauhan</b> hoon — LeadsGuru top affiliate (5 Years Experience, ₹15 Lakh+ Earned from Karnal, Haryana).</p>
      <p style="font-size: 15px; line-height: 1.6;">Aapne humare system mein interest dikhaya hai. Maine aapki financial freedom aur skill growth ke liye best resources taiyar kiye hain.</p>
      
      <div style="background: #f4f8f5; padding: 18px; border-left: 4px solid #4CAF50; margin: 20px 0; border-radius: 6px;">
        <h3 style="margin-top: 0; color: #2e7d32;">🚀 Aapke Exclusive Benefits:</h3>
        <ul style="margin-bottom: 0; padding-left: 20px; line-height: 1.8;">
          <li>Proven 5-Year Earning System</li>
          <li>Personal Mentorship &amp; Daily Support</li>
          <li>Weekly Live Masterclasses</li>
          <li>8 PM Daily Webinar Access</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="https://www.zoom.com/8pm-meeting" style="background: linear-gradient(135deg, #4CAF50, #2196F3); color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 15px; display: inline-block;">🔴 Join Tonight's 8 PM Webinar</a>
      </div>

      <p style="font-size: 15px;">Koi bhi question ho toh WhatsApp par direct message kar sakte ho!</p>
      <br/>
      <p style="font-size: 15px; margin-bottom: 0;">Cheers,<br/><b>Yuvin Chauhan</b><br/><span style="color: #666; font-size: 13px;">Instagram: @yuvinchauhann | Karnal, Haryana</span></p>
    </div>
  `;

  return await sendEmail(toEmail, subject, htmlContent);
}

/**
 * Send 8 PM Webinar Reminder Email
 */
async function sendWebinarReminderEmail(toEmail, leadName = 'Friend', webinarLink = "https://www.zoom.com/8pm-meeting") {
  if (!toEmail) return { success: false, error: 'No email provided' };

  const subject = `🔴 TODAY AT 8 PM: Exclusive Live Masterclass with Yuvin Chauhan`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 24px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; background: #ffffff;">
      <h2 style="color: #E91E63; margin-top: 0;">🔴 8 PM LIVE WEBINAR REMINDER!</h2>
      <p style="font-size: 15px; line-height: 1.6;">Hi ${leadName},</p>
      <p style="font-size: 15px; line-height: 1.6;">Aaj raat <b>8:00 PM</b> humara Special Live Masterclass start hone wala hai!</p>
      <p style="font-size: 15px; line-height: 1.6;">Is session mein main share karunga kaise maine 5 saal mein <b>₹15 Lakh+</b> earn kiye aur aap kaise start kar sakte ho.</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${webinarLink}" style="background: linear-gradient(135deg, #E91E63 0%, #9C27B0 100%); color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 30px; font-weight: bold; display: inline-block; font-size: 16px;">Join 8 PM Zoom Meeting</a>
      </div>

      <p style="font-size: 14px; color: #666;">Seats limited hain, 5 mins pehle join kar lena!</p>
      <p style="font-size: 12px; color: #999; margin-bottom: 0;">If you wish to stop receiving these emails, reply STOP on WhatsApp.</p>
      <p style="font-size: 15px; margin-top: 10px;">See you at 8 PM,<br/><b>Yuvin Chauhan</b></p>
    </div>
  `;

  return await sendEmail(toEmail, subject, htmlContent);
}

/**
 * Generic Send Email via Gmail SMTP
 */
async function sendEmail(toEmail, subject, htmlContent) {
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.log(`📧 [EMAIL MOCK] To: ${toEmail} | Subject: "${subject}" (No Gmail credentials)`);
    return { success: false, error: 'NO_GMAIL_CREDENTIALS' };
  }

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `"Yuvin Chauhan" <${GMAIL_USER}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent
    });
    console.log(`✅ Gmail Email sent successfully to ${toEmail} (Message ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ Gmail Email Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendWelcomeEmail,
  sendWebinarReminderEmail,
  sendEmail
};
