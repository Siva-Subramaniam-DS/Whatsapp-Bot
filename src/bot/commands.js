import { PLANS, can } from '../billing/plans.js';
import { verifyLicense } from '../billing/license.js';

export const HELP = `🛡️ *ScamGuard commands* (group admins only)
!guard on | off – turn protection on or off
!guard status – plan, settings, scams blocked
!guard strict | normal – detection sensitivity (strict: Pro)
!guard allow <domain> – trust a website (Pro)
!guard unallow <domain> – remove a trusted website
!guard strikes <n> – warnings before removal, 0 = never (Pro)
!guard activate <key> – upgrade this group
!guard help – this list`;

const proOnly = (what) => `🔒 ${what} is a Pro feature. Upgrade with *!guard activate <key>*.`;

/**
 * Handle a !guard command. Returns the reply text, or null if not a command.
 * @param {{text:string, groupJid:string, isAdmin:boolean}} msg
 */
export function handleCommand({ text, groupJid, isAdmin }, store, config) {
  const m = /^\s*[!/.]guard\b\s*(\S*)\s*(.*)$/i.exec(text || '');
  if (!m) return null;
  const [, rawCmd, rawArg] = m;
  const cmd = rawCmd.toLowerCase() || 'help';
  const arg = rawArg.trim();

  if (cmd === 'help') return HELP;
  if (!isAdmin) return 'Only group admins can change ScamGuard settings.';

  const g = store.group(groupJid);
  const plan = g.plan;

  switch (cmd) {
    case 'on':
      store.updateGroup(groupJid, { enabled: true });
      return '🛡️ ScamGuard is ON. Make sure I am a group admin so I can delete scams.';
    case 'off':
      store.updateGroup(groupJid, { enabled: false });
      return 'ScamGuard is OFF for this group.';
    case 'status': {
      const expiry = g.plan_expires_at ? ` (until ${new Date(g.plan_expires_at).toISOString().slice(0, 10)})` : '';
      return [
        '🛡️ *ScamGuard status*',
        `Protection: ${g.enabled ? 'ON' : 'OFF'}`,
        `Plan: ${PLANS[plan].label}${expiry}`,
        `Mode: ${g.mode}`,
        `Remove after: ${can(plan, 'warnAndRemove') ? (g.max_strikes || 'never') + ' strike(s)' : 'Pro only'}`,
        `Trusted sites: ${g.allow_list.length ? g.allow_list.join(', ') : 'none'}`,
        `Scams blocked: ${g.blocked_count}`,
      ].join('\n');
    }
    case 'strict':
      if (!can(plan, 'strictMode')) return proOnly('Strict mode');
      store.updateGroup(groupJid, { mode: 'strict' });
      return 'Strict mode on: more messages with links will be removed.';
    case 'normal':
      store.updateGroup(groupJid, { mode: 'normal' });
      return 'Normal mode on.';
    case 'allow': {
      if (!can(plan, 'allowList')) return proOnly('Trusted sites');
      const domain = arg.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return 'Usage: !guard allow example.com';
      if (!g.allow_list.includes(domain)) store.updateGroup(groupJid, { allow_list: [...g.allow_list, domain] });
      return `✅ ${domain} is now trusted.`;
    }
    case 'unallow': {
      const domain = arg.toLowerCase();
      store.updateGroup(groupJid, { allow_list: g.allow_list.filter((d) => d !== domain) });
      return `${domain} removed from trusted sites.`;
    }
    case 'strikes': {
      if (!can(plan, 'warnAndRemove')) return proOnly('Removing repeat scammers');
      const n = Number.parseInt(arg, 10);
      if (!Number.isInteger(n) || n < 0 || n > 10) return 'Usage: !guard strikes <0-10>';
      store.updateGroup(groupJid, { max_strikes: n });
      return n === 0 ? 'Scammers will be warned but never removed.' : `Scammers will be removed after ${n} strike(s).`;
    }
    case 'activate': {
      const r = verifyLicense(arg, config.licenseSecret);
      if (!r.ok) return `❌ ${r.error}`;
      const used = store.licenseGroups(r.id);
      if (!used.includes(groupJid)) {
        if (used.length >= PLANS[r.plan].maxGroups) return '❌ This key is already used by the maximum number of groups.';
        store.addLicense(r.id, groupJid);
      }
      store.updateGroup(groupJid, { plan: r.plan, plan_expires_at: r.expiresAt, license_id: r.id });
      return `🎉 ${PLANS[r.plan].label} activated until ${new Date(r.expiresAt).toISOString().slice(0, 10)}. Thank you!`;
    }
    default:
      return `Unknown command. ${HELP}`;
  }
}
