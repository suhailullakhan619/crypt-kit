// Self sign-up with approval, and forgot / reset password, end to end over HTTP.
import request from 'supertest';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import config from '../../crypt.config.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import '../models/ActivityLog.js';
import { createApp } from '../app.js';
import { loadEnv, setEnvForTests } from '../config/env.js';
import { setTransportForTests } from './mailService.js';
import { hashPassword, RESET_TTL_MS } from './authService.js';
import { startDb } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';

const SUPER = config.roles[0];
const LOWEST = config.roles[config.roles.length - 1];
const SMTP = { SMTP_HOST: 'smtp.example.test', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'App <app@example.test>' };
let db;
let app;
let sent;
let boss;

const useMail = (on) => {
  setEnvForTests({ ...loadEnv({ DEMO_MODE: 'true', JWT_SECRET: TEST_SECRET, CLIENT_URL: 'https://portal.test', ...(on ? SMTP : {}) }) });
  sent = [];
  if (on) {
    const t = nodemailer.createTransport({ jsonTransport: true });
    const orig = t.sendMail.bind(t);
    t.sendMail = async (m) => { sent.push(m); return orig(m); };
    setTransportForTests(t);
  } else setTransportForTests(null);
};
const bearer = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: String(u._id), role: u.role, name: u.name }, TEST_SECRET)}` });
const post = (path, body, headers = {}) => request(app).post(`/api/auth/${path}`).set(headers).send(body);
const tokenFromLastMail = () => new URL(sent.at(-1).text.match(/https:\/\/portal\.test\/reset-password\?token=\S+/)[0]).searchParams.get('token');

beforeAll(async () => {
  db = await startDb([]);
  await Notification.createCollection().catch(() => {});
  await Notification.syncIndexes();
  app = await createApp();
});
afterAll(async () => { setTransportForTests(null); await db.stop(); });
beforeEach(async () => {
  await db.clear();
  useMail(true);
  boss = await User.create({ name: 'Boss', email: 'boss@example.test', role: SUPER, passwordHash: await hashPassword('boss-password-1') });
});

describe('sign-up', () => {
  test('creates an inactive account with the lowest role, and tells every superuser', async () => {
    const res = await post('signup', { name: 'New Person', email: 'New@Example.test', password: 'new-password-1' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ pending: true, email: 'new@example.test' });
    const u = await User.findOne({ email: 'new@example.test' });
    expect(u).toMatchObject({ active: false, pendingApproval: true, role: LOWEST, name: 'New Person' });
    const n = await Notification.findOne({ user: boss._id });
    expect(n.title).toMatch(/New Person signed up and is waiting for approval/);
    expect(n.link).toBe('/users');
    expect(sent.some((m) => m.to === 'boss@example.test' && /waiting for approval/.test(m.subject))).toBe(true);
  });

  test('cannot sign in until approved, and is told why only with the right password', async () => {
    await post('signup', { name: 'Waiter', email: 'wait@example.test', password: 'wait-password-1' });
    const right = await post('login', { email: 'wait@example.test', password: 'wait-password-1' });
    expect(right.status).toBe(401);
    expect(right.body.error).toMatch(/waiting for approval/);
    const wrong = await post('login', { email: 'wait@example.test', password: 'nope-nope-nope' });
    expect(wrong.body.error).toBe('Invalid email or password');
  });

  test('approval by a superuser lets them in with the chosen role, and emails them', async () => {
    await post('signup', { name: 'Waiter', email: 'wait@example.test', password: 'wait-password-1' });
    const u = await User.findOne({ email: 'wait@example.test' });
    const midRole = config.roles[1];
    expect((await request(app).patch(`/api/users/${u._id}`).set(bearer(boss)).send({ role: midRole })).status).toBe(200);
    const ok = await request(app).patch(`/api/users/${u._id}`).set(bearer(boss)).send({ active: true });
    expect(ok.status).toBe(200);
    expect(ok.body.user ?? ok.body).toMatchObject({ active: true, pendingApproval: false });
    expect(sent.some((m) => m.to === 'wait@example.test' && /approved/.test(m.subject))).toBe(true);
    const login = await post('login', { email: 'wait@example.test', password: 'wait-password-1' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe(midRole);
  });

  test('rejects bad input and duplicate emails, and never lets a sign-up choose its role', async () => {
    const bad = await post('signup', { name: '', email: 'nope', password: 'short' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.fields).sort()).toEqual(['email', 'name', 'password']);
    expect((await post('signup', { name: 'Dup', email: 'BOSS@example.test', password: 'dup-password-1' })).status).toBe(409);
    await post('signup', { name: 'Sneaky', email: 'sneaky@example.test', password: 'sneak-password-1', role: SUPER, active: true, pendingApproval: false });
    expect(await User.findOne({ email: 'sneaky@example.test' })).toMatchObject({ role: LOWEST, active: false, pendingApproval: true });
  });

  test('a deactivated (not pending) account still gets the generic message', async () => {
    await User.create({ name: 'Old', email: 'old@example.test', role: LOWEST, active: false, passwordHash: await hashPassword('old-password-1') });
    expect((await post('login', { email: 'old@example.test', password: 'old-password-1' })).body.error).toBe('Invalid email or password');
  });

  test('the login page is told whether sign-up and password reset are offered', async () => {
    const meta = await request(app).get('/api/meta/public');
    expect(meta.body).toMatchObject({ signup: true, passwordReset: true });
    useMail(false);
    expect((await request(app).get('/api/meta/public')).body.passwordReset).toBe(false);
  });
});

describe('forgot and reset password', () => {
  test('emails a link that sets a new password once', async () => {
    const res = await post('forgot-password', { email: 'Boss@Example.test' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/spam/);
    expect(sent.at(-1)).toMatchObject({ to: 'boss@example.test' });
    expect(sent.at(-1).subject).toMatch(/Reset your password/);
    const token = tokenFromLastMail();

    const stored = await User.findOne({ email: 'boss@example.test' }).select('+resetTokenHash');
    expect(stored.resetTokenHash).toBeTruthy();
    expect(stored.resetTokenHash).not.toContain(token); // only a hash is stored

    expect((await post('reset-password', { token, password: 'brand-new-pass-2' })).status).toBe(204);
    expect((await post('login', { email: 'boss@example.test', password: 'brand-new-pass-2' })).status).toBe(200);
    expect((await post('login', { email: 'boss@example.test', password: 'boss-password-1' })).status).toBe(401);
    const again = await post('reset-password', { token, password: 'another-pass-33' });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/invalid or has expired/);
  });

  test('gives the same answer for unknown emails and sends nothing', async () => {
    const res = await post('forgot-password', { email: 'nobody@example.test' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  test('an expired link, a made-up link and a short password are refused', async () => {
    await post('forgot-password', { email: 'boss@example.test' });
    const token = tokenFromLastMail();
    expect((await post('reset-password', { token, password: 'short' })).status).toBe(400);
    expect((await post('reset-password', { token: 'x'.repeat(43), password: 'long-enough-12' })).status).toBe(400);
    await User.updateOne({ email: 'boss@example.test' }, { resetTokenExpires: new Date(Date.now() - RESET_TTL_MS) });
    expect((await post('reset-password', { token, password: 'long-enough-12' })).status).toBe(400);
  });

  test('pending and deactivated accounts get no reset link', async () => {
    await post('signup', { name: 'Waiter', email: 'wait@example.test', password: 'wait-password-1' });
    sent = [];
    await post('forgot-password', { email: 'wait@example.test' });
    expect(sent).toHaveLength(0);
  });

  test('in demo mode the demo accounts keep their passwords, so the one-click demo cannot be broken', async () => {
    const demo = config.demoUsers[0];
    const u = await User.create({ name: demo.name, email: demo.email, role: demo.role, passwordHash: await hashPassword(demo.password) });
    const change = await post('change-password', { currentPassword: demo.password, newPassword: 'hijacked-pass-1' }, bearer(u));
    expect(change.status).toBe(409);
    expect(change.body.error).toMatch(/Demo accounts keep their password/);
    expect((await post('forgot-password', { email: demo.email })).status).toBe(200); // same answer as always
    expect(sent).toHaveLength(0); // but no link is sent
    expect((await post('login', { email: demo.email, password: demo.password })).status).toBe(200);
  });

  test('without email on the server, forgot password says so plainly', async () => {
    useMail(false);
    const res = await post('forgot-password', { email: 'boss@example.test' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not set up/);
  });
});
