-- Add actual_amount and editor_feedback to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS editor_feedback TEXT;

-- No change to RLS needed; existing policies allow editors to update their taken orders to completed.
