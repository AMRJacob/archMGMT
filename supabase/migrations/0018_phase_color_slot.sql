-- Each phase keeps its colour when phases are reordered: color_slot is its place in the project's palette.
-- Add-only; empty = assigned from the phase order.
alter table phases add column if not exists color_slot integer;
