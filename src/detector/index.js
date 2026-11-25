import crypto from 'node:crypto';
import {
  INVITE_LINK, URL, SHORTENERS, OFF_PLATFORM, RISKY_TLDS, KEYWORD_GROUPS, POINTS,
} from './rules.js';

export const THRESHOLDS = { normal: 60, strict: 40 };
// Scores in [GREY_ZONE_MIN, threshold) can be sent to the AI checker on paid plans.
export const GREY_ZONE_MIN = 25;

export function extractLinks(text) {
  return (text.match(URL) || []).map((l) => l.toLowerCase());
}

function domainOf(link) {
  const cleaned = link.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return cleaned.split(/[/?#]/)[0];
}

function isAllowed(link, allowList) {
  const d = domainOf(link);
  return allowList.some((a) => d === a || d.endsWith(`.${a}`));
}

/** Short fingerprint of a message, used to spot the same spam in many groups. */
export function fingerprint(text) {
  const normal = text.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return crypto.createHash('sha256').update(normal).digest('hex').slice(0, 16);
}

/**
 * Score a message.
 * @param {string} text
 * @param {object} ctx
 * @param {string[]} [ctx.allowList]   domains the group trusts
 * @param {boolean} [ctx.foreignSender] sender's country code differs from the group's
 * @param {boolean} [ctx.newMember]     sender joined recently / never posted before
 * @param {number}  [ctx.seenInOtherGroups] how many other guarded groups got this text
 * @param {number}  [ctx.forwardingScore]   WhatsApp's forward counter
 * @returns {{score:number, reasons:string[]}}
 */
export function scoreMessage(text, ctx = {}) {
  const { allowList = [], foreignSender = false, newMember = false, seenInOtherGroups = 0, forwardingScore = 0 } = ctx;
  const reasons = [];
  let score = 0;
  const add = (pts, why) => { score += pts; reasons.push(`${why} (+${pts})`); };

  if (!text || !text.trim()) return { score: 0, reasons };
  const lower = text.toLowerCase();

  const links = extractLinks(text).filter((l) => !isAllowed(l, allowList));

  if (INVITE_LINK.test(text) && !allowList.includes('chat.whatsapp.com')) add(POINTS.inviteLink, 'WhatsApp group invite link');
  if (links.some((l) => SHORTENERS.includes(domainOf(l)))) add(POINTS.shortener, 'shortened link');
  if (links.some((l) => OFF_PLATFORM.some((p) => l.includes(p)))) add(POINTS.offPlatform, 'link to private chat / Telegram');
  if (links.some((l) => RISKY_TLDS.some((t) => domainOf(l).endsWith(t)))) add(POINTS.riskyTld, 'suspicious website ending');

  let keywordPoints = 0;
  for (const group of KEYWORD_GROUPS) {
    const hits = group.terms.filter((t) => lower.includes(t));
    if (hits.length) {
      const pts = Math.min(group.cap, hits.length * group.weight);
      keywordPoints += pts;
      add(pts, `${group.name} words: ${hits.slice(0, 3).join(', ')}`);
    }
  }

  if (links.length && keywordPoints > 0) add(POINTS.anyLinkWithKeywords, 'link together with scam words');
  if (foreignSender && (links.length || keywordPoints)) add(POINTS.foreignSender, 'foreign number');
  if (newMember && (links.length || keywordPoints)) add(POINTS.newMember, 'new member');
  if (seenInOtherGroups > 0) add(POINTS.repeatedAcrossGroups, `same text in ${seenInOtherGroups} other group(s)`);
  if (forwardingScore >= 4 && (links.length || keywordPoints)) add(POINTS.forwardedMany, 'forwarded many times');

  return { score, reasons };
}

/**
 * Decide what to do with a message.
 * @returns {'delete'|'review'|'allow'}
 */
export function verdict(score, mode = 'normal') {
  const threshold = THRESHOLDS[mode] ?? THRESHOLDS.normal;
  if (score >= threshold) return 'delete';
  if (score >= GREY_ZONE_MIN) return 'review';
  return 'allow';
}
