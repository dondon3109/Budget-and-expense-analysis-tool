-- Avatar pictures are only ever read through the Worker's /api/public/avatars route,
-- which fetches pre-R2 objects with the service role. Making the bucket private keeps
-- it from doubling as anonymous image hosting on the project domain.
update storage.buckets
set public = false
where id = 'avatars';

-- Owners can still read their own picture through the authenticated Storage API.
create policy "Users can read their own avatars"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
