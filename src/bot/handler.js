import { scoreMessage, verdict, fingerprint } from '../detector/index.js';
import { can } from '../billing/plans.js';
import { handleCommand } from './commands.js';

const NOTICE_COOLDOWN_MS = 60_000; // at most one "scam removed" notice per group per minute
const ADMIN_REMINDER_MS = 6 * 3600_000; // remind to make the bot admin at most every 6h

/**
 * Platform-neutral message handler.
 *
 * `client` hides WhatsApp details:
 *   sendText(groupJid, text, {mentions?, quoted?})
 *   deleteMessage(groupJid, rawMessage)
 *   removeMember(groupJid, userJid)
 *   isAdmin(groupJid, userJid) -> Promise<boolean>
 *   botIsAdmin(groupJid) -> Promise<boolean>
 *
 * `msg` is a normalised message:
 *   { groupJid, senderJid, text, fromMe, forwardingScore, raw }
 */
export function createHandler({ client, store, config, logger = console }) {
  const lastNotice = new Map();
  const lastAdminReminder = new Map();

  const cooled = (map, key, ms) => {
    const now = Date.now();
    if ((map.get(key) ?? 0) > now - ms) return false;
    map.set(key, now);
    return true;
  };

  const isForeign = (jid) => {
    if (!config.homeCountryCode || !jid.endsWith('@s.whatsapp.net')) return false;
    return !jid.startsWith(config.homeCountryCode);
  };

  const mention = (jid) => `@${jid.split('@')[0].split(':')[0]}`;

  return async function onMessage(msg) {
    const { groupJid, senderJid, text, fromMe } = msg;
    if (fromMe || !groupJid?.endsWith('@g.us') || !text) return { action: 'ignored' };

    const senderIsAdmin = await client.isAdmin(groupJid, senderJid);

    // 1. Commands
    const reply = handleCommand({ text, groupJid, isAdmin: senderIsAdmin }, store, config);
    if (reply) {
      await client.sendText(groupJid, reply, { quoted: msg.raw });
      return { action: 'command' };
    }

    const group = store.group(groupJid);
    if (!group.enabled || senderIsAdmin) return { action: 'allowed' };

    // 2. Score
    const { score, reasons } = scoreMessage(text, {
      allowList: group.allow_list,
      foreignSender: isForeign(senderJid),
      newMember: store.isNewMember(groupJid, senderJid),
      seenInOtherGroups: store.seenInOtherGroups(fingerprint(text), groupJid),
      forwardingScore: msg.forwardingScore ?? 0,
    });
    const decision = verdict(score, group.mode);
    // 'review' is where the paid AI second opinion will plug in (roadmap phase 3).
    if (decision !== 'delete') return { action: 'allowed', score };

    // 3. Act
    if (!(await client.botIsAdmin(groupJid))) {
      if (cooled(lastAdminReminder, groupJid, ADMIN_REMINDER_MS)) {
        await client.sendText(groupJid,
          '⚠️ This message looks like a scam, but I can\'t delete it because I am not a group admin. Please make me an admin.',
          { quoted: msg.raw });
      }
      return { action: 'not_admin', score };
    }

    await client.deleteMessage(groupJid, msg.raw);
    store.incrementBlocked(groupJid);
    logger.info?.({ groupJid, score, reasons }, 'scam deleted');

    if (can(group.plan, 'warnAndRemove') && group.max_strikes > 0) {
      const strikes = store.addStrike(groupJid, senderJid);
      if (strikes >= group.max_strikes) {
        await client.removeMember(groupJid, senderJid);
        store.clearStrikes(groupJid, senderJid);
        await client.sendText(groupJid, `🚫 ${mention(senderJid)} was removed for posting scams.`, { mentions: [senderJid] });
        return { action: 'removed', score };
      }
      await client.sendText(groupJid,
        `🛡️ ${mention(senderJid)} your message was removed as a likely scam. Warning ${strikes}/${group.max_strikes}.`,
        { mentions: [senderJid] });
      return { action: 'deleted', score };
    }

    if (cooled(lastNotice, groupJid, NOTICE_COOLDOWN_MS)) {
      const promo = can(group.plan, 'showPromo') && config.promoLink ? `\nProtect your group too: ${config.promoLink}` : '';
      await client.sendText(groupJid, `🛡️ A likely scam message was removed by ScamGuard.${promo}`);
    }
    return { action: 'deleted', score };
  };
}
