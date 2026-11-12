begin;

-- 1. Two test users (the trigger creates their profiles from the metadata)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin1@example.com',
   '{"first_name": "Ala", "nick": "Admin Ala"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'parent1@example.com',
   '{"first_name": "Piotr", "nick": "Tata Piotra"}');

-- 2. Make user 1 an app admin
insert into public.app_admins (user_id) values ('aaaaaaaa-0000-0000-0000-000000000001');

-- 3. Act as user 1 and call the RPC
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';
select public.create_group('Judo – wtorki', array['parent1@example.com']);

commit;