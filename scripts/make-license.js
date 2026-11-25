// Usage: node scripts/make-license.js <pro|business> <days>
// Run this after a customer pays, then send them the key.
import 'dotenv/config';
import { createLicense } from '../src/billing/license.js';

const [plan = 'pro', days = '30'] = process.argv.slice(2);
try {
  console.log(createLicense(plan, Number(days), process.env.LICENSE_SECRET));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
