import nodemailer from 'nodemailer';
import { getEnv } from '../config/env.js';

let transport = null;
let transportKey = null;

/**
 * Test helper: replace the transport (for example `nodemailer.createTransport({ jsonTransport: true })`).
 * `{ realProvider: true }` makes it behave like a real provider (reserved test domains are skipped).
 */
export function setTransportForTests(t, { realProvider = false } = {}) {
  transport = t;
  transportKey = t ? (realProvider ? 'test-real' : 'test') : null;
}

/** True when SMTP is configured (host, user, password and sender are all set). */
export function mailEnabled() {
  return !!getEnv().MAIL || transportKey === 'test' || transportKey === 'test-real';
}

function getTransport() {
  if (transportKey === 'test' || transportKey === 'test-real') return transport;
  const mail = getEnv().MAIL;
  if (!mail) return null;
  const key = `${mail.host}:${mail.port}:${mail.user}`;
  if (!transport || transportKey !== key) {
    transport = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.port === 465,
      auth: { user: mail.user, pass: mail.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    transportKey = key;
  }
  return transport;
}

/**
 * Test transports and a local fake mail server (MAIL_ALLOW_TEST_DOMAINS=true) may receive mail for
 * reserved test domains; a real provider never gets it.
 */
export function allowsTestDomains() {
  return transportKey === 'test' || getEnv().MAIL?.allowTestDomains === true;
}

/** True for addresses on domains reserved for testing (.test, .example, .invalid, .localhost). */
export function isReservedAddress(address) {
  const domain = String(address).trim().toLowerCase().replace(/>$/, '').split('@').pop() ?? '';
  return /(^|\.)(test|example|invalid|localhost)$/.test(domain);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Builds the plain-text and HTML bodies of a notification email. Every value is escaped.
 * @param {{ title: string, body?: string, url?: string, appName: string }} n
 */
export function renderNotificationEmail({ title, body = '', url = '', appName }) {
  const text = [title, body, url ? `Open it here: ${url}` : '', '', `You get this email because of your ${appName} account.`].filter((l, i) => l !== '' || i > 0).join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1c1c28">
<h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(title)}</h2>
${body ? `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(body)}</p>` : ''}
${url ? `<p style="margin:0 0 20px"><a href="${escapeHtml(url)}" style="background:#5b3df5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in ${escapeHtml(appName)}</a></p>` : ''}
<p style="margin:0;font-size:12px;color:#6b6b7a">You get this email because of your ${escapeHtml(appName)} account.</p>
</div>`;
  return { text, html };
}

/**
 * Sends one email. Never throws: a mail problem must not break the job or request that triggered it.
 * @param {{ to: string|string[], subject: string, text: string, html?: string, attachments?: any[] }} message
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function sendMail({ to, subject, text, html, attachments }) {
  const t = getTransport();
  if (!t) return { sent: false, reason: 'email is not configured' };
  // Demo accounts use reserved domains (RFC 2606) that can never receive mail. Sending to them through a
  // real provider only causes bounces, costs quota and hurts the sender's reputation, so skip them.
  const recipients = (Array.isArray(to) ? to : [to]).filter((r) => r && (allowsTestDomains() || !isReservedAddress(r)));
  if (!recipients.length) return { sent: false, reason: 'reserved test address' };
  to = Array.isArray(to) ? recipients : recipients[0];
  const mail = getEnv().MAIL;
  try {
    await t.sendMail({
      from: mail?.from ?? 'Crypt Kit <no-reply@example.test>',
      ...(mail?.replyTo ? { replyTo: mail.replyTo } : {}),
      to,
      subject: String(subject).slice(0, 200),
      text,
      html,
      attachments,
    });
    return { sent: true };
  } catch (err) {
    console.error('sendMail failed:', err.message);
    return { sent: false, reason: err.message };
  }
}
