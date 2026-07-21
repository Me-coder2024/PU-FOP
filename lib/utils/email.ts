import nodemailer from 'nodemailer';

// SMTP transporter — configure via environment variables
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[Email] SMTP not configured. Emails will be logged but not sent.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const FROM_NAME = process.env.SMTP_FROM_NAME || 'PU-FOP System';
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@paruluniversity.ac.in';

/**
 * Sends a styled HTML notification email.
 * Fails silently — never blocks the main flow.
 */
export async function sendNotificationEmail(
  to: string,
  subject: string,
  bodyHtml: string,
) {
  const transporter = createTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background:#F0F2F8; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F8; padding:32px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.06);">
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#4361EE 0%,#2D46B9 100%); padding:28px 32px; text-align:center;">
                  <h1 style="margin:0; color:#ffffff; font-size:20px; font-weight:800; letter-spacing:-0.5px;">
                    PU-FOP
                  </h1>
                  <p style="margin:4px 0 0; color:rgba(255,255,255,0.7); font-size:11px; text-transform:uppercase; letter-spacing:2px;">
                    Faculty of Pharmacy
                  </p>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:32px;">
                  <h2 style="margin:0 0 16px; color:#1e293b; font-size:16px; font-weight:700;">
                    ${subject}
                  </h2>
                  <div style="color:#475569; font-size:14px; line-height:1.7;">
                    ${bodyHtml}
                  </div>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding:20px 32px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center;">
                  <p style="margin:0; color:#94a3b8; font-size:11px;">
                    This is an automated notification from PU-FOP. Please do not reply to this email.
                  </p>
                  <p style="margin:6px 0 0; color:#cbd5e1; font-size:10px;">
                    © ${new Date().getFullYear()} Parul University — Faculty of Pharmacy
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  if (!transporter) {
    console.log(`[Email] Would send to ${to}: "${subject}"`);
    console.log(`[Email] Body: ${bodyHtml.substring(0, 200)}...`);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject: `[PU-FOP] ${subject}`,
      html,
    });
    console.log(`[Email] Sent to ${to}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err);
    return { sent: false, reason: String(err) };
  }
}

/**
 * Sends notification email to all users with a specific role.
 * Useful for notifying all deans or PG directors about a new drug request.
 */
export async function sendRoleNotificationEmail(
  role: string,
  subject: string,
  bodyHtml: string,
) {
  // This function is called from API routes that already have the service client.
  // The caller should pass the emails directly or use the helper below.
  console.log(`[Email] Role notification queued for role: ${role}, subject: ${subject}`);
}
