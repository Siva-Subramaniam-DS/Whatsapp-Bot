// Scam signals. Each rule adds points to a message's risk score.
// Keep patterns lowercase; messages are lowercased before matching.

export const INVITE_LINK = /chat\.whatsapp\.com\/(?:invite\/)?[a-z0-9]{10,}/i;

export const URL = /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9-]+\.(?:com|net|org|xyz|top|club|online|site|vip|io|me|ly|gg|link|shop|live|info|in)\b(?:\/[^\s]*)?/gi;

export const SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'is.gd', 'rb.gy', 'shorturl.at',
  'tiny.cc', 'ow.ly', 'rebrand.ly', 'linktr.ee', 's.id',
];

// Links that move people off the group into a private chat or another app.
export const OFF_PLATFORM = ['t.me', 'telegram.me', 'wa.me', 'api.whatsapp.com/send', 'wa.link'];

export const RISKY_TLDS = ['.xyz', '.top', '.club', '.online', '.site', '.vip', '.shop', '.live', '.buzz', '.icu'];

// Weighted keyword groups. Each match adds its weight, capped per group.
export const KEYWORD_GROUPS = [
  {
    name: 'investment',
    cap: 30,
    weight: 10,
    terms: [
      'stock market', 'stocks', 'equity', 'investment group', 'investor', 'investors',
      'trading', 'forex', 'crypto', 'bitcoin', 'usdt', 'binance', 'portfolio',
      'dividend', 'ipo', 'shares', 'financial services', 'fund manager', 'mentor',
      'signals', 'pips', 'nifty', 'sensex', 'mutual fund',
    ],
  },
  {
    name: 'recruiting',
    cap: 25,
    weight: 10,
    terms: [
      'welcome to join', 'join our group', 'join the group', 'join us', 'click the link',
      'click below', 'allowing me to post', 'thank you to the admin', 'thank you to the administrator',
      'thanks admin', 'greetings to you all', 'hello everyone', 'dm me', 'inbox me',
      'message me privately', 'limited slots', 'limited seats', 'free of charge',
      'first-hand information', 'daily updates',
    ],
  },
  {
    name: 'money_promise',
    cap: 30,
    weight: 15,
    terms: [
      'guaranteed profit', 'guaranteed returns', 'double your money', 'risk free', 'risk-free',
      'daily profit', 'daily income', 'earn from home', 'work from home', 'passive income',
      'per day', 'withdraw', 'roi', '100% profit', 'financial freedom', 'make money',
      'part time job', 'part-time job', 'youtube likes', 'task job',
    ],
  },
  {
    name: 'phishing',
    cap: 30,
    weight: 15,
    terms: [
      'verify your account', 'account suspended', 'claim your prize', 'you have won',
      'congratulations you', 'gift card', 'free recharge', 'kyc update', 'update your kyc',
      'otp', 'lottery', 'bank details',
    ],
  },
];

// Points for each signal.
export const POINTS = {
  inviteLink: 45,
  shortener: 25,
  offPlatform: 20,
  riskyTld: 20,
  anyLinkWithKeywords: 10,
  foreignSender: 10,
  newMember: 10,
  repeatedAcrossGroups: 30,
  forwardedMany: 10,
};
