const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in .env for email sending');
  }

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });
  } else {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  return transporter;
}

function setTransporter(customTransporter) {
  transporter = customTransporter;
}

/**
 * Send a 6-digit OTP email for email verification during registration.
 * @param {string} to - Recipient email address
 * @param {string} name - Recipient display name
 * @param {string} otp  - 6-digit OTP code
 */
async function sendOtpEmail(to, name, otp) {
  const t = getTransporter();

  return await t.sendMail({
    from: `"SplitUp" <${process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@splitup.app'}>`,
    to,
    subject: 'Your SplitUp Verification Code',
    text: `Hi ${name || 'there'},\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't create a SplitUp account, ignore this email.\n\n— The SplitUp Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f172a; border-radius: 16px; color: #f8fafc; border: 1px solid #1e293b;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px; font-weight: 800; font-size: 22px; color: white;">S</div>
          <h2 style="margin: 16px 0 6px; color: #ffffff; font-size: 20px; font-weight: 700;">Verify your email</h2>
          <p style="margin: 0; color: #94a3b8; font-size: 14px;">Hi <strong style="color: #f1f5f9;">${name || 'there'}</strong>, enter this code to complete your SplitUp registration.</p>
        </div>
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
          <span style="font-size: 2.2rem; font-weight: 800; letter-spacing: 0.35em; color: #818cf8; font-family: monospace; padding-left: 0.35em;">${otp}</span>
        </div>
        <p style="margin: 0 0 12px; color: #64748b; font-size: 13px; text-align: center;">This code expires in <strong style="color: #cbd5e1;">10 minutes</strong>.</p>
        <p style="margin: 0; color: #475569; font-size: 12px; text-align: center;">If you didn't request this code, you can safely ignore this email.</p>
      </div>
    `,
  });
}

/**
 * Send a 6-digit OTP email for password reset.
 * @param {string} to - Recipient email address
 * @param {string} name - Recipient display name
 * @param {string} otp  - 6-digit OTP code
 */
async function sendPasswordResetOtpEmail(to, name, otp) {
  const t = getTransporter();

  return await t.sendMail({
    from: `"SplitUp Security" <${process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@splitup.app'}>`,
    to,
    subject: 'SplitUp Password Reset Code',
    text: `Hi ${name || 'there'},\n\nYour password reset code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request a password reset, please secure your account immediately.\n\n— The SplitUp Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f172a; border-radius: 16px; color: #f8fafc; border: 1px solid #1e293b;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; background: linear-gradient(135deg, #ef4444, #f97316); border-radius: 12px; font-weight: 800; font-size: 22px; color: white;">🔒</div>
          <h2 style="margin: 16px 0 6px; color: #ffffff; font-size: 20px; font-weight: 700;">Reset your password</h2>
          <p style="margin: 0; color: #94a3b8; font-size: 14px;">Hi <strong style="color: #f1f5f9;">${name || 'there'}</strong>, use the code below to reset your SplitUp password.</p>
        </div>
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
          <span style="font-size: 2.2rem; font-weight: 800; letter-spacing: 0.35em; color: #f87171; font-family: monospace; padding-left: 0.35em;">${otp}</span>
        </div>
        <p style="margin: 0 0 12px; color: #64748b; font-size: 13px; text-align: center;">This code expires in <strong style="color: #cbd5e1;">10 minutes</strong>.</p>
        <p style="margin: 0; color: #475569; font-size: 12px; text-align: center;">If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { getTransporter, setTransporter, sendOtpEmail, sendPasswordResetOtpEmail };

