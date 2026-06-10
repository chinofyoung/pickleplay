insert into storage.buckets (id, name, public) values
  ('payment-qrs','payment-qrs', true),
  ('payment-proofs','payment-proofs', false)
on conflict do nothing;

create policy proofs_read on storage.objects for select using (
  bucket_id = 'payment-proofs' and (
    is_admin() or owner = auth.uid() or exists(
      select 1 from bookings b join courts ct on ct.id=b.court_id join clubs c on c.id=ct.club_id
      where b.payment_proof_path = storage.objects.name and (b.player_id=auth.uid() or c.owner_id=auth.uid())
    )
  )
);
create policy proofs_write on storage.objects for insert with check (
  bucket_id = 'payment-proofs' and auth.uid() is not null
);
create policy qrs_write on storage.objects for insert with check (
  bucket_id = 'payment-qrs' and auth.uid() is not null
);
