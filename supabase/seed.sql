-- LOCAL ONLY. Applied by `supabase db reset` / first `supabase start`; never by
-- `supabase db push`. Never run with `--include-seed` or `db reset --linked`.
--
-- Seed app admin for dev and CI smoke:
--   e-mail:   admin@example.com
--   password: Admin-Passw0rd!

-- GoTrue needs a confirmed auth.users row with empty-string token columns plus a
-- matching auth.identities row (provider 'email'), otherwise sign-in fails.
-- The insert fires on_auth_user_created, so the metadata must carry first_name and nick.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-00000000ad01',
  'authenticated',
  'authenticated',
  'admin@example.com',
  extensions.crypt('Admin-Passw0rd!', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"first_name": "Admin", "nick": "Admin aplikacji"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-00000000ad01',
  '00000000-0000-0000-0000-00000000ad01',
  '00000000-0000-0000-0000-00000000ad01',
  'email',
  '{"sub": "00000000-0000-0000-0000-00000000ad01", "email": "admin@example.com", "email_verified": true}'::jsonb,
  now(),
  now(),
  now()
)
on conflict do nothing;

insert into public.app_admins (user_id)
values ('00000000-0000-0000-0000-00000000ad01')
on conflict (user_id) do nothing;
