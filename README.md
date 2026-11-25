# ScamGuard: WhatsApp Anti-Scam Bot

Add this bot to a WhatsApp group, make it an admin, and it deletes scam posts
such as fake "investment group" invites, crypto and job scams, and phishing
links. Paid plans also warn and then remove the people who post them.

See **[PLAN.md](PLAN.md)** for how it works, the business model, and the risks.

## Quick start

```bash
cp .env.example .env    # set LICENSE_SECRET and HOME_COUNTRY_CODE
npm install
npm test
npm start               # scan the QR code with the bot's WhatsApp number
```

Use a **separate phone number** for the bot, never your personal one. See the
risks section in PLAN.md.

## Keep it running on a server

```bash
npm install -g pm2
pm2 start src/index.js --name scamguard
pm2 save && pm2 startup
```

## Sell a licence

```bash
node scripts/make-license.js pro 30        # Pro, 30 days
node scripts/make-license.js business 365  # Business, 1 year
```

The customer sends `!guard activate <key>` in their group.

## Group commands

`!guard help` lists them all: `on`, `off`, `status`, `strict`, `normal`,
`allow <domain>`, `unallow <domain>`, `strikes <n>`, `activate <key>`.
