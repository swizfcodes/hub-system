-- Migration 000056 — Insert any missing document_numbering sequences
-- Uses ON CONFLICT DO NOTHING so it is safe to run even if rows already exist.

INSERT INTO shared.document_numbering (business, document_type, prefix, next_number, padding)
VALUES
  ('diffusers', 'supplier',    'DFS-SUP', 1, 4),
  ('jewelry',   'supplier',    'JWL-SUP', 1, 4),
  ('diffusers', 'payroll_run', 'DFS-PR',  1, 4),
  ('jewelry',   'payroll_run', 'JWL-PR',  1, 4)
ON CONFLICT (business, document_type) DO NOTHING;
