-- Wishlist: an "Approved – ready to build" status. Setting an item to it is the go-ahead for Claude to build it.
alter table wishlist drop constraint if exists wishlist_status_check;
alter table wishlist add constraint wishlist_status_check
  check (status in ('new', 'under_review', 'approved', 'planned', 'in_progress', 'complete', 'infeasible', 'duplicate'));
