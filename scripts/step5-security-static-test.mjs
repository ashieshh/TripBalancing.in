import fs from 'node:fs';

const server = fs.readFileSync('server.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const db = fs.readFileSync('src/lib/supabase.ts', 'utf8');
const sql = fs.readFileSync('STEP5_SECURITY_RLS_20260824.sql', 'utf8');
const buddy = fs.readFileSync('src/components/BuddyInviteModal.tsx', 'utf8');
const admin = fs.readFileSync('src/components/AdminDashboard.tsx', 'utf8');

const tests = [
  ['itinerary endpoint authenticated', /app\.post\("\/api\/generate-itinerary", verifyUserAuth/.test(server)],
  ['recommend endpoint authenticated', /app\.post\("\/api\/recommend-destinations", verifyUserAuth/.test(server)],
  ['travel tips endpoint authenticated', /app\.post\("\/api\/travel-tips", verifyUserAuth/.test(server)],
  ['chat endpoint authenticated', /app\.post\("\/api\/itinerary-chat", verifyUserAuth/.test(server)],
  ['server loads authoritative entitlements', /loadAuthoritativeEntitlement\(authUser\.id/.test(server)],
  ['server consumes entitlements', /consumeTripEntitlement\(authUser\.id/.test(server)],
  ['frontend sends bearer for generation', /Authorization.*Bearer.*accessToken/s.test(app)],
  ['frontend no longer writes quota counters', !/upsertUserProfile\([\s\S]{0,200}(free_trips_used|paid_trips_balance)/.test(app)],
  ['real Supabase profile updates are preference-only', /server-owned[\s\S]*global_packing_checked/.test(db) && !/payload\.plan\s*=/.test(db)],
  ['no hard-coded owner admin email', !/@gmail\.com/.test(server.match(/async function verifyAdminAuth[\s\S]*?\/\/ Enable Gzip/)?.[0] || '')],
  ['transactional email requires auth', /app\.post\("\/api\/email\/send-transactional", verifyUserAuth/.test(server)],
  ['buddy email sends bearer', /send-transactional[\s\S]{0,500}Authorization.*Bearer/s.test(buddy)],
  ['admin email sends bearer', /send-transactional[\s\S]{0,500}Authorization.*Bearer/s.test(admin)],
  ['support endpoint requires auth', /app\.post\("\/api\/support-tickets", verifyUserAuth/.test(server)],
  ['refund endpoint requires auth', /app\.post\("\/api\/refund-requests", verifyUserAuth/.test(server)],
  ['RLS restricts profile entitlement writes', /grant update \(global_packing_checked, updated_at\) on public\.user_profiles to authenticated/i.test(sql)],
  ['RLS buddy write status only', /grant update \(status\) on public\.buddy_invitations to authenticated/i.test(sql)],
  ['RLS shared trip read policy exists', /Accepted buddies can view shared trips/.test(sql)],
  ['payment ID uniqueness exists', /payments_razorpay_payment_id_uidx/.test(sql)],
];

let failed = 0;
for (const [name, ok] of tests) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`\n${failed} Step 5 static security checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} Step 5 static security checks passed.`);
