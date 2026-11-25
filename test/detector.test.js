import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMessage, verdict, fingerprint } from '../src/detector/index.js';

// The scam from the screenshot that started this project.
const SCREENSHOT_SCAM = `🏅EU Equity Investment Group—Investor Forum
Hello everyone! Greetings to you all, and thank you to the administrator for allowing me to post this.

This group provides daily updates on the latest stock market news, bringing you first-hand information.

👉: https://chat.whatsapp.com/BRUDpO6zqJRFsmDbzAvX7Q

Everyone with an interest in stocks is welcome to join! 👏`;

test('screenshot scam is deleted in normal mode', () => {
  const { score } = scoreMessage(SCREENSHOT_SCAM, { foreignSender: true });
  assert.ok(score >= 100, `score was ${score}`);
  assert.equal(verdict(score, 'normal'), 'delete');
});

test('bare invite link alone is reviewed, not auto-deleted in normal mode', () => {
  const { score } = scoreMessage('https://chat.whatsapp.com/ABCDEFGHIJKLMNOP');
  assert.equal(verdict(score, 'normal'), 'review');
  assert.equal(verdict(score, 'strict'), 'delete');
});

test('crypto job scam with telegram link is deleted', () => {
  const msg = 'Part time job! Earn from home, daily income 3000 per day guaranteed profit. DM me https://t.me/richclub';
  const { score } = scoreMessage(msg);
  assert.equal(verdict(score), 'delete');
});

test('shortened phishing link is deleted', () => {
  const msg = 'Congratulations you have won a gift card! Verify your account: https://bit.ly/3xYz';
  assert.equal(verdict(scoreMessage(msg).score), 'delete');
});

test('normal club chat is allowed', () => {
  for (const msg of [
    'Courts booked for Thursday 7pm, who is in?',
    'Great game today everyone!',
    'Results are on https://astonhawks.co.uk/results',
    'Hello everyone, welcome to our new members 👋',
  ]) {
    assert.equal(verdict(scoreMessage(msg).score), 'allow', msg);
  }
});

test('allow-listed invite link is not flagged', () => {
  const { score } = scoreMessage('Join the juniors group: https://chat.whatsapp.com/ABCDEFGHIJKLMNOP', {
    allowList: ['chat.whatsapp.com'],
  });
  assert.equal(verdict(score), 'allow');
});

test('same text in other groups raises the score', () => {
  const base = scoreMessage('Join us for daily trading signals https://example.com').score;
  const repeated = scoreMessage('Join us for daily trading signals https://example.com', { seenInOtherGroups: 3 }).score;
  assert.ok(repeated > base);
});

test('fingerprint ignores links and punctuation', () => {
  assert.equal(
    fingerprint('Join NOW!! https://chat.whatsapp.com/AAA'),
    fingerprint('join now https://chat.whatsapp.com/BBB'),
  );
});
