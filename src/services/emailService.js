const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in .env for email sending');
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  return transporter;
}

/**
 * Send a 6-digit OTP email for email verification.
 * @param {string} to - Recipient email address
 * @param {string} name - Recipient display name
 * @param {string} otp  - 6-digit OTP code
 */
async function sendOtpEmail(to, name, otp) {
  const t = getTransporter();

  await t.sendMail({
    from: `"SplitUp" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your SplitUp verification code',
    text: `Hi ${name},\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't create a SplitUp account, ignore this email.\n\n— The SplitUp Team`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f5f7fb;border-radius:16px">
        <h2 style="margin:0 0 8px;color:#1d2733">Verify your email</h2>
        <p style="margin:0 0 24px;color:#475569">Hi <strong>${name}</strong>, use the code below to finish creating your SplitUp account.</p>
        <div style="background:#1e1e2e;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <span style="font-size:2.5rem;font-weight:800;letter-spacing:0.3em;color:#a5b4fc;font-family:monospace">${otp}</span>
        </div>
        <p style="margin:0;color:#64748b;font-size:0.85rem">This code expires in <strong>10 minutes</strong>. If you didn't sign up, you can safely ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail };
