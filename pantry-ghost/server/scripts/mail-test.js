/**
 * Sends one test email with the SMTP settings from server/.env, so you can check them without
 * waiting for a real notification:
 *
 *   npm run mail:test -- you@example.com
 */
import { getEnv } from '../src/config/env.js';
import { sendMail, renderNotificationEmail } from '../src/services/mailService.js';
import config from '../crypt.config.js';

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: npm run mail:test -- you@example.com');
  process.exit(1);
}

let env;
try {
  env = getEnv();
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exit(1);
}
if (!env.MAIL) {
  console.error('✖ Email is not configured. Fill SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM in server/.env');
  process.exit(1);
}

console.log(`Sending from ${env.MAIL.from} via ${env.MAIL.host}:${env.MAIL.port} to ${to} …`);
const { text, html } = renderNotificationEmail({
  title: `Test email from ${config.appName}`,
  body: 'If you can read this, email notifications are set up correctly.',
  url: env.CLIENT_URL,
  appName: config.appName,
});
const result = await sendMail({ to, subject: `[${config.appName}] Test email`, text, html });
if (result.sent) {
  console.log('✔ Sent. Check the inbox (and the spam folder).');
} else {
  console.error(`✖ Not sent: ${result.reason}`);
  process.exit(1);
}
