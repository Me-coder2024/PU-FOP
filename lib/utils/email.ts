import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_NAME = process.env.SMTP_FROM_NAME || 'PU-FOP System';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const DEFAULT_PG_DIRECTOR_EMAIL = process.env.PG_DIRECTOR_EMAIL || 'pgdirector.fop@paruluniversity.ac.in';

// SMTP transporter fallback
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function getStyledEmailHtml(subject: string, bodyHtml: string): string {
  return `
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
                    Faculty of Pharmacy — Parul University
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
                    This is an automated notification from PU-FOP System. Contact: <a href="mailto:${DEFAULT_PG_DIRECTOR_EMAIL}" style="color:#4361EE;">${DEFAULT_PG_DIRECTOR_EMAIL}</a>
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
}

/**
 * Sends a styled HTML notification email via Resend (with SMTP fallback).
 * All outgoing emails set replyTo: pgdirector.fop@paruluniversity.ac.in
 */
export async function sendNotificationEmail(
  to: string,
  subject: string,
  bodyHtml: string,
  fromAddress?: string,
  idempotencyKey?: string
) {
  const html = getStyledEmailHtml(subject, bodyHtml);
  const sender = fromAddress || `${FROM_NAME} <${FROM_EMAIL}>`;

  // 1. Try Resend API
  try {
    if (!resend) throw new Error("RESEND_API_KEY is not configured");
    const data = await resend.emails.send({
      from: sender,
      replyTo: DEFAULT_PG_DIRECTOR_EMAIL,
      to,
      subject: `[PU-FOP] ${subject}`,
      html,
    }, idempotencyKey ? { idempotencyKey } : undefined);
    if (data.error) throw new Error(data.error.message);
    console.log(`[Resend Email] Successfully sent to ${to}:`, data);
    return { sent: true, data };
  } catch (resendErr) {
    if (idempotencyKey && resend) return { sent: false, reason: 'Resend delivery failed or is uncertain; reconcile the outbox before retrying.' };
    console.warn(`[Resend Email Warning] Resend failed for ${to}, checking SMTP fallback:`, resendErr);
  }

  // 2. SMTP Fallback if Resend fails or domain needs verification
  const transporter = createTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        replyTo: DEFAULT_PG_DIRECTOR_EMAIL,
        to,
        subject: `[PU-FOP] ${subject}`,
        html,
      });
      console.log(`[SMTP Email] Sent to ${to}: ${info.messageId}`);
      return { sent: true, messageId: info.messageId };
    } catch (smtpErr) {
      console.error(`[SMTP Email Error] Failed to send to ${to}:`, smtpErr);
      return { sent: false, reason: String(smtpErr) };
    }
  }

  return { sent: false, reason: 'Resend API and SMTP fallback failed' };
}

/**
 * Sends a notification directly to the PG Director (pgdirector.fop@paruluniversity.ac.in).
 */
export async function sendPgDirectorNotification(
  subject: string,
  bodyHtml: string
) {
  return sendNotificationEmail(DEFAULT_PG_DIRECTOR_EMAIL, subject, bodyHtml);
}
