-- Website and campaign checkout orders should be visible in the unified Sales
-- → Orders view as soon as checkout succeeds, while payment is being settled.
-- `payment_pending` is deliberately not actionable as proof approval; only a
-- bank-transfer order with uploaded proof transitions to `pending_proof`.

ALTER TABLE jewelry.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE jewelry.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN ('payment_pending', 'pending_proof', 'confirmed',
                    'partially_fulfilled', 'fulfilled', 'awaiting_dispatch',
                    'cancelled'));

ALTER TABLE diffusers.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE diffusers.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN ('payment_pending', 'pending_proof', 'confirmed',
                    'partially_fulfilled', 'fulfilled', 'awaiting_dispatch',
                    'cancelled'));
