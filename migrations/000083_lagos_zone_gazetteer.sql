-- ============================================================
-- MIGRATION 000055 — Comprehensive Lagos area → zone mapping
--
-- Replaces the seed match_terms (which only listed the policy's example
-- areas) with a broad gazetteer so a free-text city/area entered at
-- checkout maps to the right delivery zone for most Lagos addresses.
-- Zones are matched in display_order (Zone 1 first), and a term matches
-- when it is a substring of what the customer typed — so specific names
-- (e.g. "lekki phase 1") resolve before the generic "lekki".
--
-- Still fully admin-editable in the logistics module; this only improves
-- the defaults. Nationwide tiers (state-matched) are unchanged.
--
-- Idempotent: UPDATE by zone name; safe to re-run.
-- ============================================================

DO $$
DECLARE
  z1 TEXT[] := ARRAY['ikoyi','victoria island','v.i','vi','lekki phase 1','lekki phase one','banana island','oniru','eko atlantic','parkview','dolphin estate','bourdillon','falomo','obalende','onikan'];
  z2 TEXT[] := ARRAY['lekki','chevron','ajah','sangotedo','lekki phase 2','lekki phase two','ikate','elegushi','agungi','osapa','jakande','ologolo','igbo efon','idado','vgc','victoria garden city','lakowe','awoyaya','abraham adesanya','badore','langbasa','eputu','bogije','ikota','chevy view','orchid','conservation','oral estate','ibeju','epe','ado'];
  z3 TEXT[] := ARRAY['yaba','surulere','ikeja','maryland','gbagada','magodo','ojota','ilupeju','palmgrove','anthony','shomolu','bariga','ebute metta','ebute-metta','ikeja gra','opebi','allen','alausa','oregun','ogudu','ojodu','berger','omole','ketu','mile 12','ojuelegba','costain','iponri','akoka','fadeyi','jibowu','sabo','onipanu'];
  z4 TEXT[] := ARRAY['ikorodu','festac','alimosho','egbeda','idimu','igando','ikotun','iyana ipaja','ayobo','ipaja','agege','iju','ifako','fagba','ojo','okokomaiko','badagry','amuwo odofin','satellite town','apapa','ajegunle','mile 2','isolo','oshodi','ejigbo','egbe','ago palace','okota','mushin','ijegun','abule egba','command','meiran','dopemu','akowonjo','itire','orile','coker'];
  sch TEXT;
BEGIN
  FOREACH sch IN ARRAY ARRAY['jewelry','diffusers'] LOOP
    EXECUTE format('UPDATE %I.delivery_zones SET match_terms = $1, updated_at = now() WHERE name = %L', sch, 'Zone 1: Island Core') USING z1;
    EXECUTE format('UPDATE %I.delivery_zones SET match_terms = $1, updated_at = now() WHERE name = %L', sch, 'Zone 2: Deep Island') USING z2;
    EXECUTE format('UPDATE %I.delivery_zones SET match_terms = $1, updated_at = now() WHERE name = %L', sch, 'Zone 3: Mainland Standard') USING z3;
    EXECUTE format('UPDATE %I.delivery_zones SET match_terms = $1, updated_at = now() WHERE name = %L', sch, 'Zone 4: Mainland Outskirts') USING z4;
  END LOOP;
END $$;
