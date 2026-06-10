create or replace function expire_pending_bookings()
returns void language sql as $$
  update bookings set status = 'cancelled'
  where status = 'pending_payment' and expires_at is not null and expires_at < now();
$$;

-- requires pg_cron extension (enable in Supabase dashboard)
select cron.schedule('expire-pending-bookings', '* * * * *', $$select expire_pending_bookings();$$);
