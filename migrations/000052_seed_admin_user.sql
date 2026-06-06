-- ─────────────────────────────────────────────────────────────
-- 000052 — Seed the first system admin (Samuel Ifeoluwa)
--
-- Creates the full contact → staff_profile → user → user_roles
-- chain. Uses gen_random_uuid() for all IDs (proper v4 UUIDs).
-- Idempotent: ON CONFLICT DO NOTHING on unique email fields.
--
-- Password: Jesus@123 (bcrypt 12 rounds, force_password_reset = true)
-- Role: owner (full access, all businesses)
--
-- NOTE: Do NOT run this on production if the user already exists.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_contact_id UUID;
  v_profile_id UUID;
  v_user_id    UUID;
  v_owner_role UUID;
BEGIN
  -- Skip if user already exists
  IF EXISTS (SELECT 1 FROM shared.users WHERE email = 'samuel.ifeoluwa@gmail.com') THEN
    RAISE NOTICE 'Admin user already exists — skipping.';
    RETURN;
  END IF;

  -- 1. Contact
  INSERT INTO shared.contacts (
    contact_type, display_name, first_name, last_name,
    primary_phone, email, visible_to, source
  ) VALUES (
    ARRAY['staff']::text[],
    'Samuel Ifeoluwa', 'Samuel', 'Ifeoluwa',
    '+2348139963576', 'samuel.ifeoluwa@gmail.com',
    ARRAY['jewelry','diffusers'], 'system_seed'
  )
  ON CONFLICT DO NOTHING
  RETURNING contact_id INTO v_contact_id;

  -- If contact already existed (e.g. as a customer), look it up
  IF v_contact_id IS NULL THEN
    SELECT contact_id INTO v_contact_id
    FROM shared.contacts WHERE email = 'samuel.ifeoluwa@gmail.com' LIMIT 1;
  END IF;

  -- 2. Staff profile
  INSERT INTO shared.staff_profiles (
    contact_id, employee_number, business,
    department, job_title, employment_type, start_date, base_salary
  ) VALUES (
    v_contact_id, 'HUB-EMP-0001', 'jewelry',
    'management', 'Business Application Manager', 'full_time', '2026-06-10', 0
  )
  ON CONFLICT DO NOTHING
  RETURNING profile_id INTO v_profile_id;

  IF v_profile_id IS NULL THEN
    SELECT profile_id INTO v_profile_id
    FROM shared.staff_profiles WHERE contact_id = v_contact_id LIMIT 1;
  END IF;

  -- 3. User login
  INSERT INTO shared.users (
    staff_profile_id, email, password_hash,
    is_active, force_password_reset,
    default_business, permitted_businesses
  ) VALUES (
    v_profile_id,
    'samuel.ifeoluwa@gmail.com',
    '$2b$12$CsF1cjKMZs/7vq1s8vG1h.xt8TdgIb9PM0mhJR9LgwB..KvsBLqK6',
    true, true, 'jewelry', ARRAY['jewelry','diffusers']
  )
  RETURNING user_id INTO v_user_id;

  -- 4. Owner role
  SELECT role_id INTO v_owner_role
  FROM shared.roles WHERE role_name = 'owner' LIMIT 1;

  INSERT INTO shared.user_roles (user_id, role_id, business)
  VALUES (v_user_id, v_owner_role, '*');

  RAISE NOTICE 'Admin seeded: user_id=%, contact=%, profile=%',
    v_user_id, v_contact_id, v_profile_id;
END $$;
