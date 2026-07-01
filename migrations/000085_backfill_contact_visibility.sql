-- ─────────────────────────────────────────────────────────────
-- 000085 — Contacts: repair empty visible_to (invisible contacts)
--
-- Onboarding an employee (and any other path that passed an empty
-- visible_to array) stored the contact with visible_to = '{}'. The
-- directory list filters on ($business = ANY(visible_to) OR
-- visible_to IS NULL), so a contact scoped to *no* business is
-- invisible in every directory — the new employee's contact never
-- showed under the Employees tab even though the staff profile (and
-- the HR headcount, which reads staff_profiles directly) existed.
--
-- The services now default an empty/missing visible_to to all active
-- businesses on insert; this migration repairs the rows already
-- written with an empty array, making them visible to every active
-- business (matching that default). Contacts that already carry at
-- least one business are left untouched.
-- ─────────────────────────────────────────────────────────────

UPDATE shared.contacts
SET visible_to = COALESCE(
      (SELECT array_agg(business_key ORDER BY business_key)
         FROM shared.business_config
        WHERE is_active = true),
      ARRAY['jewelry', 'diffusers']
    ),
    updated_at = now()
WHERE visible_to IS NOT NULL
  AND cardinality(visible_to) = 0;
