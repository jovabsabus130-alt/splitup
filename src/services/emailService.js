const nodemailer = require('nodemailer');

let transporter = null;
let fallbackTransporter = null;

function sanitize(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

function getCredentials() {
  const user = sanitize(process.env.SMTP_USER);
  const pass = sanitize(process.env.SMTP_PASS).replace(/\s+/g, '');
  return { user, pass };
}

function buildTransportOptions(port, secure) {
  const { user, pass } = getCredentials();
  const host = sanitize(process.env.SMTP_HOST) || 'smtp.gmail.com';

  return {
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    },
    // Force IPv4 to prevent IPv6 DNS timeout hangs on cloud hosts (Render, Railway, Heroku, AWS)
    family: 4,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  };
}

function createTransporterInstance(isFallback = false) {
  const { user, pass } = getCredentials();

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in .env for email sending');
  }

  const configuredHost = sanitize(process.env.SMTP_HOST);
  const configuredPort = Number(process.env.SMTP_PORT);
  const configuredSecure = process.env.SMTP_SECURE === 'true';

  if (isFallback) {
    // If primary was 587 (or default), fallback to 465 SSL; if primary was 465, fallback to 587
    const fallbackPort = configuredPort === 465 ? 587 : 465;
    const fallbackSecure = fallbackPort === 465;
    return nodemailer.createTransport(buildTransportOptions(fallbackPort, fallbackSecure));
  }

  const primaryPort = configuredPort || 587;
  const primarySecure = configuredSecure || primaryPort === 465;

  return nodemailer.createTransport(buildTransportOptions(primaryPort, primarySecure));
}

function getTransporter() {
  if (transporter) {
    return transporter;
  }
  transporter = createTransporterInstance(false);
  return transporter;
}

function getFallbackTransporter() {
  if (fallbackTransporter) {
    return fallbackTransporter;
  }
  fallbackTransporter = createTransporterInstance(true);
  return fallbackTransporter;
}

function setTransporter(customTransporter) {
  transporter = customTransporter;
  fallbackTransporter = customTransporter;
}

function logEmailDiagnostics(err, context = 'Send Mail') {
  const { user, pass } = getCredentials();
  const maskedUser = user ? `${user.slice(0, 3)}***@${user.split('@')[1] || 'domain'}` : '(not set)';
  const passLength = pass ? pass.length : 0;

  console.error(`\n[Email Service Diagnostic] ${context} Failed:`);
  console.error(`  - Error Message: ${err.message}`);
  console.error(`  - Error Code: ${err.code || 'N/A'}`);
  console.error(`  - SMTP Response Code: ${err.responseCode || err.response || 'N/A'}`);
  console.error(`  - Configured User: ${maskedUser}`);
  console.error(`  - Configured Pass Length: ${passLength} characters`);

  if (err.code === 'EAUTH' || (err.response && String(err.response).includes('535'))) {
    console.error('  👉 ACTION REQUIRED: Google rejected your SMTP credentials (535).');
    console.error('     1. Ensure 2-Step Verification is turned ON for your Google account.');
    console.error('     2. Generate a dedicated 16-character Google App Password (myaccount.google.com/apppasswords).');
    console.error('     3. Set SMTP_PASS in your production dashboard (Render / Railway / Vercel) to that 16-character code (without quotes).');
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ESOCKET') {
    console.error(`  👉 ACTION REQUIRED: Network/Connection timeout (${err.code}).`);
    console.error('     Your cloud provider may be blocking outbound port 587/465 or DNS resolution failed.');
  }
  console.error('');
}

async function sendViaResend(apiKey, mailOptions) {
  const from = sanitize(process.env.RESEND_FROM) || sanitize(process.env.SMTP_FROM) || 'SplitUp <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [mailOptions.to],
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || `Resend API Error (${response.status}): ${JSON.stringify(data)}`);
  }
  return { messageId: data.id, provider: 'resend-https' };
}

async function sendViaBrevo(apiKey, mailOptions) {
  const fromEmail = sanitize(process.env.SMTP_USER) || 'noreply@splitup.app';
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'SplitUp', email: fromEmail },
      to: [{ email: mailOptions.to }],
      subject: mailOptions.subject,
      htmlContent: mailOptions.html,
      textContent: mailOptions.text,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || `Brevo API Error (${response.status}): ${JSON.stringify(data)}`);
  }
  return { messageId: data.messageId, provider: 'brevo-https' };
}

async function sendMailWithAutoFallback(mailOptions, context = 'Email') {
  // If custom mock transporter was set (e.g. unit tests), use it directly
  if (transporter && transporter.sendMail && (transporter !== fallbackTransporter || (!process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY))) {
    return await transporter.sendMail(mailOptions);
  }

  // 1. High-Reliability HTTPS API: Resend (Port 443 — NEVER blocked on Render/Railway)
  const resendKey = sanitize(process.env.RESEND_API_KEY);
  if (resendKey) {
    try {
      const result = await sendViaResend(resendKey, mailOptions);
      console.log(`[Email Service] Dispatched via Resend HTTPS to ${mailOptions.to}. ID: ${result.messageId}`);
      return result;
    } catch (resendErr) {
      console.error(`[Email Service] Resend HTTPS dispatch failed:`, resendErr.message);
    }
  }

  // 2. High-Reliability HTTPS API: Brevo (Port 443 — NEVER blocked on Render/Railway)
  const brevoKey = sanitize(process.env.BREVO_API_KEY);
  if (brevoKey) {
    try {
      const result = await sendViaBrevo(brevoKey, mailOptions);
      console.log(`[Email Service] Dispatched via Brevo HTTPS to ${mailOptions.to}. ID: ${result.messageId}`);
      return result;
    } catch (brevoErr) {
      console.error(`[Email Service] Brevo HTTPS dispatch failed:`, brevoErr.message);
    }
  }

  // 3. Standard SMTP (Port 587 STARTTLS)
  try {
    const primary = getTransporter();
    return await primary.sendMail(mailOptions);
  } catch (primaryErr) {
    logEmailDiagnostics(primaryErr, `${context} (Primary SMTP Port Attempt)`);

    // 4. Fallback SMTP (Port 465 SSL)
    console.warn(`[Email Service] Attempting fallback transporter for ${mailOptions.to}...`);
    try {
      const fallback = getFallbackTransporter();
      const result = await fallback.sendMail(mailOptions);
      console.log(`[Email Service] Fallback delivery successful to ${mailOptions.to}. MessageId: ${result?.messageId || 'ok'}`);
      return result;
    } catch (fallbackErr) {
      logEmailDiagnostics(fallbackErr, `${context} (Fallback SMTP Port Attempt)`);
      throw fallbackErr;
    }
  }
}

/**
 * Send a 6-digit OTP email for email verification during registration.
 * @param {string} to - Recipient email address
 * @param {string} name - Recipient display name
 * @param {string} otp  - 6-digit OTP code
 */
async function sendOtpEmail(to, name, otp) {
  const fromAddress = sanitize(process.env.SMTP_FROM) || sanitize(process.env.SMTP_USER) || 'noreply@splitup.app';
  const mailOptions = {
    from: `"SplitUp" <${fromAddress}>`,
    to,
    replyTo: fromAddress,
    subject: `Your SplitUp Verification Code: ${otp}`,
    priority: 'high',
    headers: {
      'X-Priority': '1 (Highest)',
      'X-MSMail-Priority': 'High',
      Importance: 'High',
    },
    text: `Hi ${name || 'there'},\n\nYour SplitUp email verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you did not initiate this registration request, please disregard this email.\n\n— The SplitUp Team`,
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
  };

  return await sendMailWithAutoFallback(mailOptions, 'Registration OTP');
}

/**
 * Send a 6-digit OTP email for password reset.
 * @param {string} to - Recipient email address
 * @param {string} name - Recipient display name
 * @param {string} otp  - 6-digit OTP code
 */
async function sendPasswordResetOtpEmail(to, name, otp) {
  const fromAddress = sanitize(process.env.SMTP_FROM) || sanitize(process.env.SMTP_USER) || 'noreply@splitup.app';
  const mailOptions = {
    from: `"SplitUp Security" <${fromAddress}>`,
    to,
    replyTo: fromAddress,
    subject: `SplitUp Password Reset Code: ${otp}`,
    priority: 'high',
    headers: {
      'X-Priority': '1 (Highest)',
      'X-MSMail-Priority': 'High',
      Importance: 'High',
    },
    text: `Hi ${name || 'there'},\n\nYour SplitUp password reset code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you did not request a password reset, please secure your account immediately.\n\n— The SplitUp Team`,
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
  };

  return await sendMailWithAutoFallback(mailOptions, 'Password Reset OTP');
}

/**
 * Diagnostic helper to verify SMTP/HTTPS delivery in production
 * @param {string} testRecipient - Optional recipient email address
 */
async function testSmtpConnection(testRecipient) {
  const { user, pass } = getCredentials();
  const resendKey = sanitize(process.env.RESEND_API_KEY);
  const brevoKey = sanitize(process.env.BREVO_API_KEY);
  const host = sanitize(process.env.SMTP_HOST) || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const to = testRecipient || user || 'jovabworks@gmail.com';

  const diagnostics = {
    provider: resendKey ? 'Resend (HTTPS Port 443)' : brevoKey ? 'Brevo (HTTPS Port 443)' : 'SMTP (Nodemailer)',
    configuredHost: host,
    configuredPort: port,
    hasResendKey: Boolean(resendKey),
    hasBrevoKey: Boolean(brevoKey),
    configuredUser: user ? `${user.slice(0, 3)}***@${user.split('@')[1] || 'domain'}` : null,
    passLength: pass ? pass.length : 0,
    timestamp: new Date().toISOString(),
  };

  if (!resendKey && !brevoKey && (!user || !pass)) {
    return {
      success: false,
      error: 'No email service configured. Set RESEND_API_KEY (recommended for Render) or SMTP_USER and SMTP_PASS in environment variables.',
      diagnostics,
    };
  }

  try {
    const result = await sendOtpEmail(to, 'SplitUp Admin', '998877');
    return {
      success: true,
      message: `Test email successfully sent to ${to}`,
      provider: result?.provider || 'smtp',
      messageId: result?.messageId || 'ok',
      diagnostics,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      code: err.code || null,
      response: err.response || null,
      command: err.command || null,
      diagnostics,
    };
  }
}

module.exports = { getTransporter, setTransporter, sendOtpEmail, sendPasswordResetOtpEmail, testSmtpConnection };




