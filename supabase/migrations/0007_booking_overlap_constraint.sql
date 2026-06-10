create extension if not exists btree_gist;

alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    court_id with =,
    date with =,
    int4range(start_hour, end_hour) with &&
  )
  where (status in ('pending_payment','proof_submitted','confirmed'));
