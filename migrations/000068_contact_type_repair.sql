-- ─────────────────────────────────────────────────────────────
-- 000068 — Contacts: repair contact_type drift
--
-- Several creation paths attached stakeholder records (employee
-- profiles, suppliers, retail partners) WITHOUT tagging the contact's
-- contact_type array, so the directory tabs and dynamic profiles
-- missed them. The services now stamp types on creation; this
-- migration repairs every existing contact.
-- ─────────────────────────────────────────────────────────────

-- Employees: any contact with a live staff profile is 'staff'
UPDATE shared.contacts c
SET contact_type = array_append(contact_type, 'staff'), updated_at = now()
WHERE EXISTS (
        SELECT 1 FROM shared.staff_profiles sp
        WHERE sp.contact_id = c.contact_id AND sp.is_deleted = false
      )
  AND NOT ('staff' = ANY(c.contact_type));

-- Suppliers + retail partners live in per-business schemas
DO $$
DECLARE
  biz TEXT;
BEGIN
  FOREACH biz IN ARRAY ARRAY['jewelry', 'diffusers'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = biz) THEN
      CONTINUE;
    END IF;

    EXECUTE format($f$
      UPDATE shared.contacts c
      SET contact_type = array_append(contact_type, 'supplier'), updated_at = now()
      WHERE EXISTS (
              SELECT 1 FROM %I.suppliers s
              WHERE s.contact_id = c.contact_id AND s.is_active = true
            )
        AND NOT ('supplier' = ANY(c.contact_type))
    $f$, biz);

    EXECUTE format($f$
      UPDATE shared.contacts c
      SET contact_type = array_append(contact_type, 'retail_partner'), updated_at = now()
      WHERE EXISTS (
              SELECT 1 FROM %I.retail_partners rp
              WHERE rp.contact_id = c.contact_id AND rp.is_active = true
            )
        AND NOT ('retail_partner' = ANY(c.contact_type))
    $f$, biz);
  END LOOP;
END $$;
