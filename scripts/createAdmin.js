"use strict";

require("dotenv").config({ path: ".env" });

const bcrypt = require("bcrypt");
const readline = require("readline");
const { pool, withSharedContext } = require("../config/db");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const q = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

(async () => {
  console.log("\n── Create Hub Admin User ──\n");

  const email = await q("Email: ");
  const password = await q("Password (min 12 chars): ");
  const business =
    (await q("Default business [jewelry/diffusers]: ")) || "jewelry";

  if (password.length < 12) {
    console.error("Password too short (min 12 characters)");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  await withSharedContext(async (client) => {
    // Create contact first
    const {
      rows: [contact],
    } = await client.query(
      `INSERT INTO shared.contacts
         (contact_type, display_name, email, primary_phone, source)
       VALUES (ARRAY['staff'], 'System Admin', $1, '00000000000', 'system')
       RETURNING contact_id`,
      [email],
    );

    // Create staff profile
    const {
      rows: [profile],
    } = await client.query(
      `INSERT INTO shared.staff_profiles
         (contact_id, employee_number, business, job_title, employment_type, start_date, base_salary)
       VALUES ($1, 'HUB-EMP-0001', $2, 'System Administrator', 'full_time', CURRENT_DATE, 0)
       RETURNING profile_id`,
      [contact.contact_id, business],
    );

    // Create user
    const {
      rows: [user],
    } = await client.query(
      `INSERT INTO shared.users
         (staff_profile_id, email, password_hash, is_active, force_password_reset,
          default_business, permitted_businesses)
       VALUES ($1, $2, $3, true, false, $4, ARRAY['jewelry','diffusers'])
       RETURNING user_id`,
      [profile.profile_id, email, hash, business],
    );

    // Assign owner role for all businesses
    const {
      rows: [ownerRole],
    } = await client.query(
      `SELECT role_id FROM shared.roles WHERE role_name = 'owner' LIMIT 1`,
    );

    await client.query(
      `INSERT INTO shared.user_roles (user_id, role_id, business, granted_by)
       VALUES ($1, $2, '*', $1)`,
      [user.user_id, ownerRole.role_id],
    );

    console.log(`\n✓ Admin created: ${email}`);
    console.log(`  User ID:  ${user.user_id}`);
    console.log(`  Business: ${business}\n`);
  });

  rl.close();
  await pool.end();
  process.exit(0);
})();
