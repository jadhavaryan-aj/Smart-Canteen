#!/usr/bin/env node
/**
 * Creates (or updates) a staff/admin account. This is the trusted
 * provisioning path: it uses the service-role key, so run it only on a
 * machine you control. There is no public admin sign-up.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     node scripts/provision-admin.mjs --email chef@example.edu --role admin --name "Head Chef"
 *
 * Set ADMIN_PASSWORD to choose the password; otherwise a strong temporary
 * password is generated and printed once. Use --revoke to remove all roles.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    role: { type: 'string', default: 'staff' },
    name: { type: 'string' },
    revoke: { type: 'boolean', default: false },
  },
});

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!url || !serviceKey) fail('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) fail('Pass a valid --email.');
if (!['admin', 'staff'].includes(values.role)) fail('--role must be "admin" or "staff".');

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = values.email.trim().toLowerCase();

async function findUser() {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findUser();

if (values.revoke) {
  if (!user) fail(`No user with email ${email}.`);
  const { error } = await supabase.from('user_roles').delete().eq('user_id', user.id);
  if (error) fail(`Could not revoke roles: ${error.message}`);
  console.log(`✔ Removed all staff/admin roles from ${email}.`);
  process.exit(0);
}

let generatedPassword = null;
if (!user) {
  const password = process.env.ADMIN_PASSWORD || (generatedPassword = randomBytes(18).toString('base64url'));
  if (password.length < 12) fail('ADMIN_PASSWORD must be at least 12 characters.');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: values.name ? { display_name: values.name } : {},
  });
  if (error) fail(`Could not create the user: ${error.message}`);
  user = data.user;
  console.log(`✔ Created user ${email}.`);
} else {
  console.log(`• User ${email} already exists; updating role only.`);
}

if (values.name) {
  const { error } = await supabase.from('profiles').update({ display_name: values.name }).eq('id', user.id);
  if (error) console.warn(`! Could not set display name: ${error.message}`);
}

const { error: roleError } = await supabase
  .from('user_roles')
  .upsert({ user_id: user.id, role: values.role }, { onConflict: 'user_id,role', ignoreDuplicates: true });
if (roleError) fail(`Could not assign the role: ${roleError.message}`);

console.log(`✔ ${email} now has the "${values.role}" role.`);
if (generatedPassword) {
  console.log(
    `\nTemporary password (shown once — share it securely and change it after first sign-in):\n  ${generatedPassword}\n`,
  );
}
