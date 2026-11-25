import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { createHandler } from '../src/bot/handler.js';
import { createLicense } from '../src/billing/license.js';

const GROUP = '120363000000000000@g.us';
const ADMIN = '447700900001@s.whatsapp.net';
const SCAMMER = '573028374261@s.whatsapp.net';
const SCAM = 'EU Equity Investment Group. Hello everyone! This group provides daily updates on the stock market. https://chat.whatsapp.com/BRUDpO6zqJRFsmDbzAvX7Q Everyone with an interest in stocks is welcome to join!';
const config = { licenseSecret: 'secret', homeCountryCode: '44', promoLink: 'https://example.com' };

function setup({ botAdmin = true } = {}) {
  const log = [];
  const client = {
    sendText: async (g, text) => log.push(['send', text]),
    deleteMessage: async () => log.push(['delete']),
    removeMember: async (g, u) => log.push(['remove', u]),
    isAdmin: async (g, u) => u === ADMIN,
    botIsAdmin: async () => botAdmin,
  };
  const store = openDb(':memory:');
  const handle = createHandler({ client, store, config, logger: {} });
  const send = (senderJid, text) => handle({ groupJid: GROUP, senderJid, text, raw: { key: {} } });
  return { log, store, send };
}

test('free plan: deletes scam and posts promo notice', async () => {
  const { log, send } = setup();
  const r = await send(SCAMMER, SCAM);
  assert.equal(r.action, 'deleted');
  assert.deepEqual(log[0], ['delete']);
  assert.match(log[1][1], /example\.com/);
});

test('normal messages are left alone', async () => {
  const { log, send } = setup();
  assert.equal((await send(SCAMMER, 'See you at the courts tonight!')).action, 'allowed');
  assert.equal(log.length, 0);
});

test('admins are never deleted', async () => {
  const { send } = setup();
  assert.equal((await send(ADMIN, SCAM)).action, 'allowed');
});

test('bot without admin rights asks to be made admin', async () => {
  const { log, send } = setup({ botAdmin: false });
  assert.equal((await send(SCAMMER, SCAM)).action, 'not_admin');
  assert.match(log[0][1], /not a group admin/);
});

test('non-admins cannot change settings', async () => {
  const { log, send } = setup();
  await send(SCAMMER, '!guard off');
  assert.match(log[0][1], /Only group admins/);
});

test('pro plan: warns, then removes after 3 strikes', async () => {
  const { log, send, store } = setup();
  await send(ADMIN, `!guard activate ${createLicense('pro', 30, 'secret')}`);
  assert.match(log.at(-1)[1], /Pro activated/);
  assert.equal(store.group(GROUP).plan, 'pro');

  assert.equal((await send(SCAMMER, SCAM)).action, 'deleted');
  assert.match(log.at(-1)[1], /Warning 1\/3/);
  await send(SCAMMER, SCAM);
  assert.equal((await send(SCAMMER, SCAM)).action, 'removed');
  assert.ok(log.some(([a, u]) => a === 'remove' && u === SCAMMER));
});

test('a pro key cannot be used in a second group', async () => {
  const { log, store } = setup();
  const key = createLicense('pro', 30, 'secret');
  const client = {
    sendText: async (g, t) => log.push(['send', t]), isAdmin: async () => true, botIsAdmin: async () => true,
  };
  const handle = createHandler({ client, store, config, logger: {} });
  await handle({ groupJid: 'a@g.us', senderJid: ADMIN, text: `!guard activate ${key}`, raw: {} });
  await handle({ groupJid: 'b@g.us', senderJid: ADMIN, text: `!guard activate ${key}`, raw: {} });
  assert.match(log.at(-1)[1], /already used/);
});

test('free plan cannot use strict mode', async () => {
  const { log, send } = setup();
  await send(ADMIN, '!guard strict');
  assert.match(log[0][1], /Pro feature/);
});
