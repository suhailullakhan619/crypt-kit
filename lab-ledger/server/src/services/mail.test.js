import nodemailer from 'nodemailer';
import { loadEnv, setEnvForTests, EnvError } from '../config/env.js';
import { sendMail, setTransportForTests, renderNotificationEmail, mailEnabled, isReservedAddress } from './mailService.js';
import { notify, sendTestEmail } from './notificationService.js';
import Notification from '../models/Notification.js';
import '../models/ActivityLog.js';
import User from '../models/User.js';
import { startDb } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const SMTP = { SMTP_HOST: 'smtp-relay.brevo.com', SMTP_USER: 'me@x.test', SMTP_PASS: 'key', MAIL_FROM: 'App <me@x.test>' };

describe('email settings', () => {
  const base = { DEMO_MODE: 'true' };

  test('are off when nothing is set, and parsed when complete', () => {
    expect(loadEnv(base).MAIL).toBeNull();
    expect(loadEnv({ ...base, ...SMTP, MAIL_REPLY_TO: 'boss@x.test' }).MAIL).toEqual({
      host: 'smtp-relay.brevo.com', port: 587, user: 'me@x.test', pass: 'key', from: 'App <me@x.test>', replyTo: 'boss@x.test', allowTestDomains: false,
    });
    expect(loadEnv({ ...base, ...SMTP, MAIL_ALLOW_TEST_DOMAINS: 'true' }).MAIL.allowTestDomains).toBe(true);
  });

  test('a half-filled setup is an error that names what is missing', () => {
    expect(() => loadEnv({ ...base, SMTP_HOST: 'h' })).toThrow(EnvError);
    expect(() => loadEnv({ ...base, SMTP_HOST: 'h', SMTP_USER: 'u' })).toThrow(/SMTP_PASS, MAIL_FROM/);
  });

  test('an empty port line falls back to 587 and a bad port is rejected', () => {
    expect(loadEnv({ ...base, ...SMTP, SMTP_PORT: '' }).MAIL.port).toBe(587);
    expect(() => loadEnv({ ...base, ...SMTP, SMTP_PORT: 'abc' })).toThrow(/SMTP_PORT/);
  });
});

describe('renderNotificationEmail', () => {
  test('escapes HTML in every value and includes the link', () => {
    const { html, text } = renderNotificationEmail({ title: '<script>x</script>', body: 'a & b', url: 'https://app.test/r/x?a=1&b="2"', appName: 'App' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('&quot;2&quot;');
    expect(text).toContain('https://app.test/r/x');
  });
});

describe('sending', () => {
  let db;
  beforeAll(async () => {
    db = await startDb([]);
    await Notification.createCollection().catch(() => {});
    await Notification.syncIndexes();
    setEnvForTests({ ...loadEnv({ DEMO_MODE: 'true', JWT_SECRET: TEST_SECRET, CLIENT_URL: 'https://app.test', ...SMTP, MAIL_REPLY_TO: 'boss@x.test' }) });
  });
  afterAll(async () => { setTransportForTests(null); await db?.stop(); });
  beforeEach(() => db.clear());

  const fake = () => nodemailer.createTransport({ jsonTransport: true });
  const capture = () => {
    const t = fake();
    const sent = [];
    const original = t.sendMail.bind(t);
    t.sendMail = async (m) => { sent.push(m); return original(m); };
    setTransportForTests(t);
    return sent;
  };
  const user = (name, role, extra = {}) => User.create({ name, email: `${name.toLowerCase()}@x.test`, role, passwordHash: 'x', ...extra });

  test('sendMail uses the configured sender and reply-to', async () => {
    const sent = capture();
    expect(mailEnabled()).toBe(true);
    expect(await sendMail({ to: 'a@x.test', subject: 'Hi', text: 'Hello' })).toEqual({ sent: true });
    expect(sent[0]).toMatchObject({ from: 'App <me@x.test>', replyTo: 'boss@x.test', to: 'a@x.test', subject: 'Hi' });
  });

  test('a real provider never gets mail for reserved test domains (demo accounts), real addresses still go out', async () => {
    const sentReal = [];
    setTransportForTests({ sendMail: async (m) => { sentReal.push(m); } }, { realProvider: true });
    expect(isReservedAddress('student@lab.test')).toBe(true);
    expect(isReservedAddress('Someone <x@demo.example>')).toBe(true);
    expect(isReservedAddress('a@b.invalid')).toBe(true);
    expect(isReservedAddress('me@gmail.com')).toBe(false);
    expect(isReservedAddress('me@latest.com')).toBe(false); // ".test" must be the whole last label
    expect(await sendMail({ to: 'student@lab.test', subject: 'x', text: 'x' })).toEqual({ sent: false, reason: 'reserved test address' });
    expect(await sendMail({ to: ['student@lab.test', 'me@gmail.com'], subject: 'x', text: 'x' })).toEqual({ sent: true });
    expect(sentReal).toHaveLength(1);
    expect(sentReal[0].to).toEqual(['me@gmail.com']);
  });

  test('"Email me a test" on a demo address explains it cannot receive email', async () => {
    setTransportForTests({ sendMail: async () => {} }, { realProvider: true });
    const demo = await user('Demo', config.roles[1], { email: 'demo@lab.test' });
    await expect(sendTestEmail(String(demo._id))).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/demo address that cannot receive email/) });
  });

  test('sendMail never throws when the server fails', async () => {
    setTransportForTests({ sendMail: async () => { throw new Error('connection refused'); } });
    expect(await sendMail({ to: 'a@x.test', subject: 'Hi', text: 'x' })).toEqual({ sent: false, reason: 'connection refused' });
  });

  test('a notification emails each active recipient once, with a link to the app', async () => {
    const sent = capture();
    const ann = await user('Ann', config.roles[1]);
    await user('Off', config.roles[1], { active: false });
    await notify({ roles: [config.roles[1]], title: 'Loan is overdue', body: 'Please return it', link: '/r/loans/1', dedupeKey: 'k' });
    await notify({ roles: [config.roles[1]], title: 'Loan is overdue', link: '/r/loans/1', dedupeKey: 'k' });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(ann.email);
    expect(sent[0].subject).toContain('Loan is overdue');
    expect(sent[0].html).toContain('https://app.test/r/loans/1');
    expect(await Notification.countDocuments()).toBe(1);
  });

  test('sendTestEmail emails the signed-in user, and explains failures', async () => {
    const sent = capture();
    const ann = await user('Ann', config.roles[1]);
    await expect(sendTestEmail(String(ann._id))).resolves.toEqual({ to: ann.email });
    expect(sent[0].to).toBe(ann.email);
    expect(sent[0].subject).toMatch(/Test email/);

    setTransportForTests({ sendMail: async () => { throw new Error('bad login'); } });
    await expect(sendTestEmail(String(ann._id))).rejects.toMatchObject({ status: 502 });
    await expect(sendTestEmail('0123456789abcdef01234567')).rejects.toMatchObject({ status: 404 });

    setTransportForTests(null);
    setEnvForTests({ ...loadEnv({ DEMO_MODE: 'true', JWT_SECRET: TEST_SECRET }) });
    await expect(sendTestEmail(String(ann._id))).rejects.toMatchObject({ status: 409 });
    setEnvForTests({ ...loadEnv({ DEMO_MODE: 'true', JWT_SECRET: TEST_SECRET, CLIENT_URL: 'https://app.test', ...SMTP }) });
  });

  test('a mail failure never stops the in-app notification', async () => {
    setTransportForTests({ sendMail: async () => { throw new Error('boom'); } });
    const ann = await user('Ann', config.roles[1]);
    await expect(notify({ userIds: [ann._id], title: 'Still saved' })).resolves.toBe(1);
    expect(await Notification.countDocuments()).toBe(1);
  });

  test('without email settings nothing is sent and notifications still work', async () => {
    setTransportForTests(null);
    setEnvForTests({ ...loadEnv({ DEMO_MODE: 'true', JWT_SECRET: TEST_SECRET }) });
    expect(mailEnabled()).toBe(false);
    const ann = await user('Ann', config.roles[1]);
    await expect(notify({ userIds: [ann._id], title: 'In-app only' })).resolves.toBe(1);
    setEnvForTests({ ...loadEnv({ DEMO_MODE: 'true', JWT_SECRET: TEST_SECRET, CLIENT_URL: 'https://app.test', ...SMTP }) });
  });
});
