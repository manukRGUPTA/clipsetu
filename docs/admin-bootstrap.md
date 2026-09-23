# Initial Clipsetu admin bootstrap

Public signup never creates an administrator. The database's normal role-management RPCs require an already active admin with a verified TOTP second factor, so initialize the first owner once through the Supabase SQL Editor.

1. Sign up for Clipsetu with the exact owner account and verify the email.
2. Open the Clipsetu Supabase project → SQL Editor.
3. Replace the placeholder below with that already-verified email, review it carefully, and run the query once.
4. Sign in and open `/admin`; enroll and verify a TOTP authenticator before reviewing accounts.

```sql
insert into public.user_roles (user_id, role, status, decision_reason, decided_at)
select id, 'admin', 'active', 'Initial owner bootstrap', now()
from auth.users
where lower(email) = lower('REPLACE_WITH_OWNER_VERIFIED_EMAIL')
  and email_confirmed_at is not null
on conflict (user_id, role) do nothing;
```

The query affects only the exact verified email supplied. Do not run it with a wildcard or an unverified address. For all later role decisions, use the MFA-protected admin workflow; do not grant users access by editing browser data.
