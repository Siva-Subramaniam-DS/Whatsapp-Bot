# ScamGuard: WhatsApp Group Anti-Scam Bot

A bot that group admins add to their WhatsApp group. It deletes scam posts
(fake "investment group" invites, crypto pumps, job scams, phishing links) and
warns, then removes, the people who post them.

---

## 1. How it works for a group admin

1. The admin adds the bot's phone number to the group.
2. The admin makes the bot a **group admin**. WhatsApp only lets admins delete
   other people's messages or remove members.
3. The bot starts guarding the group on the Free plan right away.
4. Admins control it with commands in the group:

| Command | What it does |
|---|---|
| `!guard on` / `!guard off` | Turn protection on or off |
| `!guard status` | Show plan, settings and how many scams were blocked |
| `!guard strict` / `!guard normal` | Change how sensitive detection is |
| `!guard allow <domain>` | Allow a trusted link (e.g. your club website) |
| `!guard strikes <n>` | Number of warnings before a member is removed (0 = never remove) |
| `!guard activate <KEY>` | Upgrade the group with a paid licence key |
| `!guard help` | Show the command list |

Only group admins can run these commands.

---

## 2. How scams are detected

Every message gets a **risk score**. The rules are in `src/detector/`:

| Signal | Example from the screenshot | Points |
|---|---|---|
| WhatsApp group invite link (`chat.whatsapp.com/...`) | yes | 45 |
| Investment / stock / crypto words | "stock market", "Investor Forum", "Equity Investment" | up to 30 |
| Recruiting phrases | "everyone ... is welcome to join", "thank you to the administrator for allowing me" | up to 25 |
| Shortened or suspicious links (bit.ly, t.me, wa.me, .xyz ...) | – | 20–25 |
| Promises of money ("guaranteed profit", "double your money") | – | 30 |
| Sender is new to the group or has a foreign country code | +57 in an Aston group | 10 |
| The same text was posted in other groups the bot guards | – | 30 |

- **Normal mode:** delete when the score is 60 or more.
- **Strict mode:** delete when the score is 40 or more.
- Group admins and allowed domains are never touched.

The scam in the screenshot scores about **120**, so it is deleted in both modes.

**Pro plan:** messages in the grey zone (score 25–60) are sent to an AI model
for a second opinion. This catches scams that are reworded to avoid the rules.

---

## 3. Architecture

```
WhatsApp  <->  Baileys connection (src/bot/connection.js)
                    |
                    v
            Message handler (src/bot/handler.js)
              |           |             |
              v           v             v
         Detector     Commands      Store (SQLite)
       (rules + AI)  (!guard ...)   groups, strikes, licences, stats
              |
              v
     Action: delete -> warn -> remove member
```

```
src/
  index.js              entry point
  config.js             settings from .env
  bot/connection.js     log in to WhatsApp (QR code), reconnect
  bot/handler.js        decide what to do with each message
  bot/commands.js       !guard commands
  detector/rules.js     the scam patterns
  detector/index.js     scoring
  billing/plans.js      Free / Pro / Business limits
  billing/license.js    signed licence keys
  store/db.js           SQLite database
scripts/make-license.js create a licence key after someone pays
test/                   detector and licence tests
```

---

## 4. How you make money

### Plans (priced per group, per month)

| | **Free** | **Pro** | **Business** |
|---|---|---|---|
| Price (India) | ₹0 | ₹149 | ₹999 |
| Price (international) | $0 | $3 | $19 |
| Groups | 1 | 1 per key | up to 15 |
| Delete invite-link and rule-based scams | yes | yes | yes |
| Warn and remove repeat offenders | – | yes | yes |
| AI check for reworded scams | – | yes | yes |
| Allow-list, strict mode | – | yes | yes |
| Weekly report sent to the admin | – | yes | yes |
| "Protected by ScamGuard" message after deleting | shown | hidden | hidden |
| Priority support | – | – | yes |

The Free plan acts as advertising. Every time it deletes a scam it posts
*"Scam removed by ScamGuard – get it for your group: <link>"*. Members of other
groups see this and ask for the bot.

### Payment flow

1. The admin pays on a simple website or a payment link (Razorpay for India,
   Stripe or Lemon Squeezy for other countries).
2. A webhook (or you, by hand at the start) runs `scripts/make-license.js`,
   which creates a key such as `SG-PRO-...`.
3. The key is sent to the admin. They type `!guard activate <key>` in their
   group.
4. The key is signed with your secret, so nobody can make fake keys. It
   includes an expiry date, so renewals are needed.

### Running costs (rough estimate)

| Item | Monthly cost |
|---|---|
| Small VPS (Hetzner, DigitalOcean, Oracle free tier) | ₹0 – ₹600 |
| Spare SIM / phone number for the bot (2–3 recommended) | ₹100 – ₹300 |
| AI checks (Pro only, short messages, cheap model) | under ₹1 per group |
| Domain and landing page | about ₹100 |

**Break-even:** about 7 Pro groups. 100 Pro groups ≈ ₹14,900 a month; 300 groups
needs several bot numbers (see risks).

### Other ways to earn

- **Set-up service:** charge housing societies, colleges, clubs and companies
  a one-time fee to add the bot and configure it.
- **White-label:** a company pays for the bot to use their own name and number.
- **Scam feed:** sell (anonymised) lists of new scam links and patterns to
  other moderation tools.

---

## 5. Important risks (read before you invest money)

1. **WhatsApp's rules.** This bot uses **Baileys**, an unofficial library that
   logs in like WhatsApp Web. WhatsApp's Terms of Service do not allow
   unofficial clients. The bot's number **can be banned**, and running it as
   a paid service makes that more likely if it grows.
   - Use a separate number, never your personal one.
   - Keep 2–3 spare numbers and spread groups across them.
   - Don't send bulk messages or join groups unless an admin invited you.
   - Tell customers clearly that WhatsApp can block the bot at any time.
2. **Official API limits.** Meta's official WhatsApp Business (Cloud) API is
   the safe route, but its group support is limited and is not designed for a
   bot being added to ordinary existing groups. Check Meta's current
   documentation before you depend on it. The detector here does not depend on
   WhatsApp, so it can be moved to the official API, Telegram or Discord later.
3. **The bot must be an admin.** Without admin rights it can only warn.
4. **Privacy.** The bot reads every message in the groups it guards. Store only
   what is needed (scores, hashes of scam texts, strike counts), never the full
   chat. Publish a short privacy policy and follow your country's data laws
   (for example, India's DPDP Act).
5. **False positives.** A real member may sometimes be deleted by mistake.
   Normal mode is the default, admins can allow trusted domains, and the
   warning message tells people what happened.

---

## 6. Roadmap

| Phase | Work | Status |
|---|---|---|
| 1. Core | Detector, delete, commands, SQLite, licence keys | **done in this repo** |
| 2. Launch | Run on a VPS with pm2, landing page, Razorpay link, test in 5–10 friendly groups | next |
| 3. Pro | AI second opinion, weekly report, payment webhook that creates keys automatically | |
| 4. Scale | Multiple bot numbers, shared scam database, admin web dashboard | |
| 5. Safer platform | Move to the official API, or add Telegram/Discord versions | |

---

## 7. Running it

```bash
cp .env.example .env      # set LICENSE_SECRET to a long random string
npm install
npm test                  # run the detector tests
npm start                 # scan the QR code with the bot's WhatsApp
```

Create a Pro key for 30 days:

```bash
node scripts/make-license.js pro 30
```
