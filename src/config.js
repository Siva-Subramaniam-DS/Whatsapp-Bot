import 'dotenv/config';

export const config = {
  licenseSecret: process.env.LICENSE_SECRET || 'change-me',
  authDir: process.env.AUTH_DIR || './auth',
  dbPath: process.env.DB_PATH || './data/scamguard.db',
  homeCountryCode: (process.env.HOME_COUNTRY_CODE || '').replace(/\D/g, ''),
  promoLink: process.env.PROMO_LINK || '',
  ownerNumbers: (process.env.OWNER_NUMBERS || '').split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean),
};

if (config.licenseSecret === 'change-me') {
  console.warn('[config] LICENSE_SECRET is not set: licence keys cannot be activated until you set it in .env');
}
