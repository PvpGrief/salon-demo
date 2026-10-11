#!/usr/bin/env node
/**
 * Create (or reset) the admin account. There is no public sign-up.
 *
 *   npm run create-admin -- owner@example.lv            → generates a strong password
 *   npm run create-admin -- owner@example.lv "MyPass…"  → uses the given password
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment / .env.
 * To target the production project, put its values in .env (or export them)
 * before running.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const [email, givenPassword] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !email.includes('@')) {
  console.error('Lietošana: npm run create-admin -- <e-pasts> [parole]');
  process.exit(1);
}
if (!url || !key) {
  console.error('Trūkst SUPABASE_URL vai SUPABASE_SERVICE_ROLE_KEY (.env failā vai vidē).');
  process.exit(1);
}
if (givenPassword && givenPassword.length < 10) {
  console.error('Parolei jābūt vismaz 10 rakstzīmēm.');
  process.exit(1);
}

const password = givenPassword || randomBytes(12).toString('base64url');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser(address) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === address.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findUser(email);
if (user) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) throw error;
  console.log(`Lietotājs ${email} jau eksistē – parole atjaunota.`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  user = data.user;
  console.log(`Izveidots lietotājs ${email}.`);
}

const { error: adminError } = await supabase.from('admin_users').upsert({ user_id: user.id });
if (adminError) {
  console.error('Neizdevās piešķirt administratora tiesības:', adminError.message);
  process.exit(1);
}

console.log('\n✅ Administrators gatavs.');
console.log(`   E-pasts: ${email}`);
if (!givenPassword) console.log(`   Parole:  ${password}   (saglabājiet to drošā vietā; var nomainīt /admin/iestatijumi)`);
console.log('   Pieteikšanās: <jūsu vietne>/admin\n');
