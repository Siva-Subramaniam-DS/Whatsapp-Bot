import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Privacy: we never store message text. Only scores, fingerprints and counts.

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      jid TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      mode TEXT NOT NULL DEFAULT 'normal',
      max_strikes INTEGER NOT NULL DEFAULT 3,
      allow_list TEXT NOT NULL DEFAULT '[]',
      plan TEXT NOT NULL DEFAULT 'free',
      license_id TEXT,
      plan_expires_at INTEGER,
      blocked_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS strikes (
      group_jid TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_jid, user_jid)
    );
    CREATE TABLE IF NOT EXISTS seen_members (
      group_jid TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      PRIMARY KEY (group_jid, user_jid)
    );
    CREATE TABLE IF NOT EXISTS fingerprints (
      hash TEXT NOT NULL,
      group_jid TEXT NOT NULL,
      seen_at INTEGER NOT NULL,
      PRIMARY KEY (hash, group_jid)
    );
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      group_jid TEXT NOT NULL,
      activated_at INTEGER NOT NULL
    );
  `);
  return makeStore(db);
}

function makeStore(db) {
  const q = {
    getGroup: db.prepare('SELECT * FROM groups WHERE jid = ?'),
    insertGroup: db.prepare('INSERT OR IGNORE INTO groups (jid, created_at) VALUES (?, ?)'),
    addStrike: db.prepare(`INSERT INTO strikes (group_jid, user_jid, count) VALUES (?, ?, 1)
      ON CONFLICT(group_jid, user_jid) DO UPDATE SET count = count + 1 RETURNING count`),
    clearStrikes: db.prepare('DELETE FROM strikes WHERE group_jid = ? AND user_jid = ?'),
    seeMember: db.prepare('INSERT OR IGNORE INTO seen_members (group_jid, user_jid, first_seen) VALUES (?, ?, ?)'),
    getMember: db.prepare('SELECT first_seen FROM seen_members WHERE group_jid = ? AND user_jid = ?'),
    addFp: db.prepare('INSERT OR IGNORE INTO fingerprints (hash, group_jid, seen_at) VALUES (?, ?, ?)'),
    countFp: db.prepare('SELECT COUNT(*) AS n FROM fingerprints WHERE hash = ? AND group_jid != ? AND seen_at > ?'),
    pruneFp: db.prepare('DELETE FROM fingerprints WHERE seen_at < ?'),
    getLicense: db.prepare('SELECT * FROM licenses WHERE id = ?'),
    countLicense: db.prepare('SELECT COUNT(*) AS n FROM licenses WHERE id = ?'),
    addLicense: db.prepare('INSERT INTO licenses (id, group_jid, activated_at) VALUES (?, ?, ?)'),
  };

  const parse = (row) => row && { ...row, enabled: !!row.enabled, allow_list: JSON.parse(row.allow_list) };

  return {
    db,
    group(jid) {
      q.insertGroup.run(jid, Date.now());
      const g = parse(q.getGroup.get(jid));
      // Paid plan ran out: fall back to Free.
      if (g.plan !== 'free' && g.plan_expires_at && g.plan_expires_at < Date.now()) {
        this.updateGroup(jid, { plan: 'free', plan_expires_at: null, license_id: null });
        return { ...g, plan: 'free', plan_expires_at: null, license_id: null };
      }
      return g;
    },
    updateGroup(jid, fields) {
      const cols = Object.keys(fields);
      const vals = cols.map((c) => (c === 'allow_list' ? JSON.stringify(fields[c]) : typeof fields[c] === 'boolean' ? Number(fields[c]) : fields[c]));
      db.prepare(`UPDATE groups SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE jid = ?`).run(...vals, jid);
    },
    incrementBlocked(jid) { db.prepare('UPDATE groups SET blocked_count = blocked_count + 1 WHERE jid = ?').run(jid); },
    addStrike: (g, u) => q.addStrike.get(g, u).count,
    clearStrikes: (g, u) => q.clearStrikes.run(g, u),
    /** Records the member and returns true if we first saw them in the last `days` days. */
    isNewMember(g, u, days = 3) {
      q.seeMember.run(g, u, Date.now());
      return q.getMember.get(g, u).first_seen > Date.now() - days * 86_400_000;
    },
    /** Records the fingerprint and returns how many OTHER groups saw it in the last 24h. */
    seenInOtherGroups(hash, g) {
      const day = Date.now() - 86_400_000;
      q.pruneFp.run(Date.now() - 7 * 86_400_000);
      q.addFp.run(hash, g, Date.now());
      return q.countFp.get(hash, g, day).n;
    },
    licenseUses: (id) => q.countLicense.get(id).n,
    licenseGroups: (id) => db.prepare('SELECT group_jid FROM licenses WHERE id = ?').all(id).map((r) => r.group_jid),
    addLicense: (id, g) => q.addLicense.run(id, g, Date.now()),
  };
}
