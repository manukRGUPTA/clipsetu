-- Additive foundation for authenticated Clipsetu workflows.
-- No demo fixtures, existing tables, or production data are modified.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

do $$ begin create type public.user_role as enum ('business', 'clipper', 'admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.account_status as enum ('pending', 'active', 'rejected', 'suspended'); exception when duplicate_object then null; end $$;
do $$ begin create type public.business_status as enum ('pending', 'approved', 'rejected', 'suspended'); exception when duplicate_object then null; end $$;
do $$ begin create type public.campaign_status as enum ('draft', 'pending_approval', 'published', 'paused', 'completed', 'cancelled', 'changes_requested', 'rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.join_mode as enum ('open', 'approval'); exception when duplicate_object then null; end $$;
do $$ begin create type public.participation_status as enum ('requested', 'active', 'declined', 'left'); exception when duplicate_object then null; end $$;
do $$ begin create type public.submission_status as enum ('submitted', 'under_review', 'changes_requested', 'accepted', 'rejected', 'withdrawn'); exception when duplicate_object then null; end $$;
do $$ begin create type public.view_report_status as enum ('pending', 'verified', 'rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payout_status as enum ('requested', 'approved', 'processing', 'paid', 'rejected', 'failed', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ledger_entry_type as enum ('base_reward', 'bonus', 'adjustment', 'reversal', 'payout'); exception when duplicate_object then null; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete restrict,
  role public.user_role not null,
  status public.account_status not null default 'pending',
  assigned_by uuid references auth.users(id) on delete set null,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 1000),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (user_id, role)
);

create table public.clipper_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  languages text[] not null default '{}',
  niches text[] not null default '{}',
  portfolio_url text,
  social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object'),
  onboarding_status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete restrict,
  company_name text not null check (char_length(company_name) between 2 and 160),
  contact_name text not null default '' check (char_length(contact_name) <= 120),
  website_url text,
  contact_email text,
  country_code text not null default 'IN' check (country_code ~ '^[A-Z]{2}$'),
  status public.business_status not null default 'pending',
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 180),
  description text not null default '',
  source_url text,
  source_rights_confirmed boolean not null default false,
  languages text[] not null default '{}',
  platforms text[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  budget_paise bigint not null default 0 check (budget_paise >= 0),
  funded_budget_paise bigint not null default 0 check (funded_budget_paise >= 0 and funded_budget_paise <= budget_paise),
  base_reward_paise bigint not null default 0 check (base_reward_paise >= 0),
  join_mode public.join_mode not null default 'approval',
  bonus_rules jsonb not null default '[]'::jsonb check (jsonb_typeof(bonus_rules) = 'array'),
  bonus_scope text check (bonus_scope is null or bonus_scope in ('per_clip', 'per_clipper', 'per_campaign')),
  bonus_stacking text check (bonus_stacking is null or bonus_stacking in ('cumulative', 'highest_only')),
  status public.campaign_status not null default 'draft',
  status_reason text check (status_reason is null or char_length(status_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.campaign_terms (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  version integer not null check (version > 0),
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (campaign_id, version)
);

create table public.campaign_participants (
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  clipper_id uuid not null references auth.users(id) on delete restrict,
  status public.participation_status not null default 'requested',
  joined_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 1000),
  primary key (campaign_id, clipper_id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  clipper_id uuid not null references auth.users(id) on delete restrict,
  source_url text not null,
  published_url text not null check (published_url ~* '^https://'),
  normalized_post_url text generated always as (
    lower(regexp_replace(split_part(split_part(btrim(published_url), '?', 1), '#', 1), '/+$', ''))
  ) stored,
  platform text not null check (platform in ('instagram_reels', 'youtube_shorts', 'tiktok', 'other')),
  published_at timestamptz not null,
  notes text not null default '' check (char_length(notes) <= 2000),
  status public.submission_status not null default 'submitted',
  terms_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(terms_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_post_url)
);

create table public.submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision public.submission_status not null check (decision in ('under_review', 'changes_requested', 'accepted', 'rejected')),
  reason text not null default '' check (char_length(reason) <= 2000),
  created_at timestamptz not null default now()
);

create table public.view_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete restrict,
  clipper_id uuid not null references auth.users(id) on delete restrict,
  reported_cumulative_views bigint not null check (reported_cumulative_views >= 0),
  capture_date date not null,
  evidence_path text,
  notes text not null default '' check (char_length(notes) <= 2000),
  status public.view_report_status not null default 'pending',
  approved_cumulative_views bigint check (approved_cumulative_views is null or approved_cumulative_views >= 0),
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewer_notes text check (reviewer_notes is null or char_length(reviewer_notes) <= 2000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (approved_cumulative_views is null or approved_cumulative_views <= reported_cumulative_views)
);

create table public.earnings_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  campaign_id uuid references public.campaigns(id) on delete restrict,
  submission_id uuid references public.submissions(id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  amount_paise bigint not null check (amount_paise <> 0),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 180),
  description text not null default '' check (char_length(description) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  destination_label text not null,
  status public.payout_status not null default 'requested',
  reason text check (reason is null or char_length(reason) <= 1000),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  idempotency_key text not null unique
);

create table public.payout_receipts (
  id uuid primary key default gen_random_uuid(),
  payout_request_id uuid not null unique references public.payout_requests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  object_path text not null,
  payment_method text not null check (payment_method in ('upi', 'bank')),
  transaction_reference_masked text not null default '',
  amount_paise bigint not null check (amount_paise > 0),
  paid_at timestamptz not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 180),
  body text not null default '' check (char_length(body) <= 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  category text not null check (category in ('submission_appeal', 'payout_help', 'account', 'other')),
  subject text not null check (char_length(subject) between 3 and 180),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null default '' check (char_length(reason) <= 1000),
  status text not null default 'requested' check (status in ('requested', 'in_review', 'completed', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  target_type text not null check (char_length(target_type) <= 80),
  target_id text not null check (char_length(target_id) <= 180),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

-- Sensitive payment destinations and immutable request snapshots are outside the
-- PostgREST-exposed public schema; clients can only use the guarded RPCs below.
create table private.payout_destinations (
  user_id uuid primary key references auth.users(id) on delete restrict,
  method text not null check (method in ('upi', 'bank')),
  upi_id text,
  account_holder text,
  account_number text,
  ifsc text,
  masked_label text not null,
  status public.account_status not null default 'pending',
  updated_at timestamptz not null default now(),
  check ((method = 'upi' and upi_id is not null and account_number is null and ifsc is null)
      or (method = 'bank' and account_holder is not null and account_number is not null and ifsc is not null and upi_id is null))
);

create table private.payout_request_destinations (
  payout_request_id uuid primary key references public.payout_requests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  method text not null check (method in ('upi', 'bank')),
  destination_snapshot jsonb not null check (jsonb_typeof(destination_snapshot) = 'object'),
  created_at timestamptz not null default now()
);

alter table private.payout_destinations enable row level security;
alter table private.payout_request_destinations enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;

create or replace function private.has_role(target_role public.user_role, target_status public.account_status default 'active')
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = target_role
      and r.status = target_status
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.has_role('admin'::public.user_role, 'active'::public.account_status)
    and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

revoke all on function private.has_role(public.user_role, public.account_status) from public, anon;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.has_role(public.user_role, public.account_status) to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  requested_role public.user_role;
begin
  requested_role := case lower(coalesce(new.raw_user_meta_data ->> 'requested_role', 'clipper'))
    when 'business' then 'business'::public.user_role
    else 'clipper'::public.user_role
  end;

  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role, status)
  values (new.id, requested_role, 'pending')
  on conflict (user_id, role) do nothing;

  if requested_role = 'clipper' then
    insert into public.clipper_profiles (user_id, onboarding_status)
    values (new.id, 'pending')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created_clipsetu
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.snapshot_submission_terms()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  select jsonb_build_object(
    'campaign_id', c.id,
    'campaign_title', c.title,
    'budget_paise', c.budget_paise,
    'base_reward_paise', c.base_reward_paise,
    'bonus_rules', c.bonus_rules,
    'bonus_scope', c.bonus_scope,
    'bonus_stacking', c.bonus_stacking,
    'currency', 'INR',
    'terms_version', coalesce((select max(t.version) from public.campaign_terms t where t.campaign_id = c.id), 1)
  ) into new.terms_snapshot
  from public.campaigns c
  where c.id = new.campaign_id;
  return new;
end;
$$;

create trigger snapshot_submission_terms_before_insert
  before insert on public.submissions
  for each row execute function private.snapshot_submission_terms();

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger clipper_profiles_set_updated_at before update on public.clipper_profiles for each row execute function private.set_updated_at();
create trigger businesses_set_updated_at before update on public.businesses for each row execute function private.set_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns for each row execute function private.set_updated_at();
create trigger submissions_set_updated_at before update on public.submissions for each row execute function private.set_updated_at();
create trigger support_requests_set_updated_at before update on public.support_requests for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.clipper_profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_terms enable row level security;
alter table public.campaign_participants enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_reviews enable row level security;
alter table public.view_reports enable row level security;
alter table public.earnings_ledger enable row level security;
alter table public.payout_requests enable row level security;
alter table public.payout_receipts enable row level security;
alter table public.notifications enable row level security;
alter table public.support_requests enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy roles_read_self_or_admin on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy clipper_profiles_read_self_or_admin on public.clipper_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy clipper_profiles_insert_self on public.clipper_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.has_role('clipper', 'pending')));
create policy clipper_profiles_update_self on public.clipper_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy businesses_read_owner_or_admin on public.businesses for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));
create policy businesses_insert_pending_owner on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending' and (select private.has_role('business', 'pending')));
create policy businesses_update_pending_owner on public.businesses for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'pending')
  with check (owner_id = (select auth.uid()) and status = 'pending');

create policy campaigns_read_published_owner_or_admin on public.campaigns for select to authenticated
  using (status = 'published'
    or (select private.is_admin())
    or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy campaigns_insert_owned_draft on public.campaigns for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'draft'
    and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid()) and b.status = 'approved')
    and (select private.has_role('business', 'active')));
create policy campaigns_update_owned_draft on public.campaigns for update to authenticated
  using (status = 'draft' and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())))
  with check (status = 'draft' and created_by = (select auth.uid())
    and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

create policy campaign_terms_read_visible_campaign on public.campaign_terms for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and
    (c.status = 'published' or (select private.is_admin()) or exists (select 1 from public.businesses b where b.id = c.business_id and b.owner_id = (select auth.uid())))));
create policy campaign_terms_insert_owned_draft on public.campaign_terms for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.campaigns c join public.businesses b on b.id = c.business_id
    where c.id = campaign_id and c.status = 'draft' and b.owner_id = (select auth.uid())
  ));

create policy participants_read_involved_or_admin on public.campaign_participants for select to authenticated
  using (clipper_id = (select auth.uid()) or (select private.is_admin()) or exists (
    select 1 from public.campaigns c join public.businesses b on b.id = c.business_id
    where c.id = campaign_id and b.owner_id = (select auth.uid())
  ));
create policy participants_request_own_published on public.campaign_participants for insert to authenticated
  with check (clipper_id = (select auth.uid()) and status in ('requested', 'active')
    and (select private.has_role('clipper', 'active'))
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status = 'published'));

create policy submissions_read_involved_or_admin on public.submissions for select to authenticated
  using (clipper_id = (select auth.uid()) or (select private.is_admin()) or exists (
    select 1 from public.campaigns c join public.businesses b on b.id = c.business_id
    where c.id = campaign_id and b.owner_id = (select auth.uid())
  ));
create policy submissions_insert_own_participation on public.submissions for insert to authenticated
  with check (clipper_id = (select auth.uid()) and status = 'submitted'
    and exists (select 1 from public.campaign_participants p where p.campaign_id = campaign_id and p.clipper_id = (select auth.uid()) and p.status = 'active')
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status = 'published'));
create policy submissions_edit_own_corrections on public.submissions for update to authenticated
  using (clipper_id = (select auth.uid()) and status = 'changes_requested')
  with check (clipper_id = (select auth.uid()) and status = 'changes_requested');

create policy submission_reviews_read_admin on public.submission_reviews for select to authenticated
  using ((select private.is_admin()));

create policy view_reports_read_involved_or_admin on public.view_reports for select to authenticated
  using (clipper_id = (select auth.uid()) or (select private.is_admin()) or exists (
    select 1 from public.submissions s join public.campaigns c on c.id = s.campaign_id
    join public.businesses b on b.id = c.business_id
    where s.id = submission_id and b.owner_id = (select auth.uid())
  ));
create policy view_reports_insert_own_accepted on public.view_reports for insert to authenticated
  with check (clipper_id = (select auth.uid()) and status = 'pending' and approved_cumulative_views is null
    and exists (select 1 from public.submissions s where s.id = submission_id and s.clipper_id = (select auth.uid()) and s.status = 'accepted'));

create policy ledger_read_owner_or_admin on public.earnings_ledger for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy payout_requests_read_owner_or_admin on public.payout_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy payout_receipts_read_owner_or_admin on public.payout_receipts for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy notifications_read_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_mark_own_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy support_requests_read_owner_or_admin on public.support_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy support_requests_insert_own on public.support_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open');
create policy deletion_requests_read_owner_or_admin on public.account_deletion_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy deletion_requests_insert_own on public.account_deletion_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'requested');
create policy audit_events_read_admin on public.audit_events for select to authenticated
  using ((select private.is_admin()));

-- Only the columns users may own are granted. Role, status, verification,
-- reward, payout, review, and audit mutations go through restricted RPCs.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.user_roles, public.clipper_profiles, public.businesses,
  public.campaigns, public.campaign_terms, public.campaign_participants, public.submissions,
  public.submission_reviews, public.view_reports, public.earnings_ledger, public.payout_requests,
  public.payout_receipts, public.notifications, public.support_requests,
  public.account_deletion_requests, public.audit_events to authenticated;
grant update (full_name, preferred_language) on public.profiles to authenticated;
grant insert (user_id, languages, niches, portfolio_url, social_links) on public.clipper_profiles to authenticated;
grant update (languages, niches, portfolio_url, social_links) on public.clipper_profiles to authenticated;
grant insert (owner_id, company_name, contact_name, website_url, contact_email, country_code)
  on public.businesses to authenticated;
grant update (company_name, contact_name, website_url, contact_email, country_code)
  on public.businesses to authenticated;
grant insert (business_id, created_by, title, description, source_url, source_rights_confirmed,
  languages, platforms, starts_at, ends_at, budget_paise, base_reward_paise, join_mode,
  bonus_rules, bonus_scope, bonus_stacking) on public.campaigns to authenticated;
grant update (title, description, source_url, source_rights_confirmed, languages, platforms,
  starts_at, ends_at, budget_paise, base_reward_paise, join_mode, bonus_rules, bonus_scope,
  bonus_stacking) on public.campaigns to authenticated;
grant insert (campaign_id, version, terms, created_by) on public.campaign_terms to authenticated;
grant insert (campaign_id, clipper_id) on public.campaign_participants to authenticated;
grant insert (campaign_id, clipper_id, source_url, published_url, platform, published_at, notes)
  on public.submissions to authenticated;
grant update (source_url, published_url, platform, published_at, notes) on public.submissions to authenticated;
grant insert (submission_id, clipper_id, reported_cumulative_views, capture_date, evidence_path, notes)
  on public.view_reports to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (user_id, category, subject, message) on public.support_requests to authenticated;
grant insert (user_id, reason) on public.account_deletion_requests to authenticated;

create or replace function public.request_campaign_review(p_campaign_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare c public.campaigns%rowtype;
begin
  if auth.uid() is null or not private.has_role('business', 'active') then
    raise exception 'Active business account required' using errcode = '42501';
  end if;
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found or not exists (select 1 from public.businesses b where b.id = c.business_id and b.owner_id = auth.uid() and b.status = 'approved') then
    raise exception 'Campaign not found or not owned by this business' using errcode = '42501';
  end if;
  if c.status <> 'draft' or c.source_url is null or not c.source_rights_confirmed or c.base_reward_paise <= 0 then
    raise exception 'Campaign draft needs an authorized source, confirmed rights, and a positive base reward';
  end if;
  update public.campaigns set status = 'pending_approval', updated_at = now() where id = c.id;
  insert into public.audit_events(actor_user_id, action, target_type, target_id)
  values (auth.uid(), 'campaign.submitted_for_review', 'campaign', c.id::text);
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role, p_status public.account_status, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Admin MFA session required' using errcode = '42501'; end if;
  if p_user_id = auth.uid() and p_role = 'admin' then raise exception 'Admins cannot grant admin role to themselves'; end if;
  insert into public.user_roles(user_id, role, status, assigned_by, decision_reason, decided_at)
  values (p_user_id, p_role, p_status, auth.uid(), left(p_reason, 1000), now())
  on conflict (user_id, role) do update set status = excluded.status, assigned_by = excluded.assigned_by,
    decision_reason = excluded.decision_reason, decided_at = excluded.decided_at;
  insert into public.audit_events(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'account.role_decided', 'user', p_user_id::text,
    jsonb_build_object('role', p_role, 'status', p_status, 'reason', left(p_reason, 1000)));
end;
$$;

create or replace function public.admin_review_business(p_business_id uuid, p_decision public.business_status, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare b public.businesses%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin MFA session required' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected', 'suspended') then raise exception 'Invalid business decision'; end if;
  select * into b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'Business not found'; end if;
  update public.businesses set status = p_decision, decision_reason = left(p_reason, 1000), updated_at = now() where id = b.id;
  update public.user_roles set status = case p_decision when 'approved' then 'active'::public.account_status when 'rejected' then 'rejected'::public.account_status else 'suspended'::public.account_status end,
    assigned_by = auth.uid(), decision_reason = left(p_reason, 1000), decided_at = now()
  where user_id = b.owner_id and role = 'business';
  insert into public.audit_events(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'business.reviewed', 'business', b.id::text, jsonb_build_object('decision', p_decision, 'reason', left(p_reason, 1000)));
end;
$$;

create or replace function public.admin_review_campaign(p_campaign_id uuid, p_decision public.campaign_status, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare c public.campaigns%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin MFA session required' using errcode = '42501'; end if;
  if p_decision not in ('published', 'changes_requested', 'rejected') then raise exception 'Invalid campaign decision'; end if;
  if p_decision in ('changes_requested', 'rejected') and coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found or c.status <> 'pending_approval' then raise exception 'Campaign is not awaiting review'; end if;
  if p_decision = 'published' and (not c.source_rights_confirmed or c.source_url is null or c.base_reward_paise <= 0) then
    raise exception 'Campaign terms are incomplete';
  end if;
  update public.campaigns set status = p_decision, status_reason = left(p_reason, 1000), updated_at = now() where id = c.id;
  insert into public.audit_events(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'campaign.reviewed', 'campaign', c.id::text, jsonb_build_object('decision', p_decision, 'reason', left(p_reason, 1000)));
end;
$$;

create or replace function public.admin_review_submission(p_submission_id uuid, p_decision public.submission_status, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare s public.submissions%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin MFA session required' using errcode = '42501'; end if;
  if p_decision not in ('under_review', 'changes_requested', 'accepted', 'rejected') then raise exception 'Invalid submission decision'; end if;
  if p_decision in ('changes_requested', 'rejected') and coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into s from public.submissions where id = p_submission_id for update;
  if not found or s.status not in ('submitted', 'under_review', 'changes_requested') then raise exception 'Submission is not reviewable'; end if;
  update public.submissions set status = p_decision, updated_at = now() where id = s.id;
  insert into public.submission_reviews(submission_id, reviewer_id, decision, reason)
  values (s.id, auth.uid(), p_decision, left(coalesce(p_reason, ''), 2000));
  insert into public.audit_events(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'submission.reviewed', 'submission', s.id::text, jsonb_build_object('decision', p_decision, 'reason', left(p_reason, 2000)));
end;
$$;

create or replace function public.admin_review_view_report(p_report_id uuid, p_decision public.view_report_status, p_approved_cumulative_views bigint default null, p_notes text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v public.view_reports%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin MFA session required' using errcode = '42501'; end if;
  select * into v from public.view_reports where id = p_report_id for update;
  if not found or v.status <> 'pending' then raise exception 'View report is not awaiting review'; end if;
  if p_decision = 'verified' and (p_approved_cumulative_views is null or p_approved_cumulative_views < 0 or p_approved_cumulative_views > v.reported_cumulative_views) then
    raise exception 'Approved cumulative views must be between zero and the reported count';
  end if;
  update public.view_reports set status = p_decision,
    approved_cumulative_views = case when p_decision = 'verified' then p_approved_cumulative_views else null end,
    reviewer_id = auth.uid(), reviewer_notes = left(p_notes, 2000), reviewed_at = now()
  where id = v.id;
  insert into public.audit_events(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'views.reviewed', 'view_report', v.id::text,
    jsonb_build_object('decision', p_decision, 'approved_cumulative_views', p_approved_cumulative_views, 'notes', left(p_notes, 2000)));
end;
$$;

revoke all on function public.request_campaign_review(uuid) from public, anon;
revoke all on function public.admin_set_user_role(uuid, public.user_role, public.account_status, text) from public, anon;
revoke all on function public.admin_review_business(uuid, public.business_status, text) from public, anon;
revoke all on function public.admin_review_campaign(uuid, public.campaign_status, text) from public, anon;
revoke all on function public.admin_review_submission(uuid, public.submission_status, text) from public, anon;
revoke all on function public.admin_review_view_report(uuid, public.view_report_status, bigint, text) from public, anon;
grant execute on function public.request_campaign_review(uuid) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role, public.account_status, text) to authenticated;
grant execute on function public.admin_review_business(uuid, public.business_status, text) to authenticated;
grant execute on function public.admin_review_campaign(uuid, public.campaign_status, text) to authenticated;
grant execute on function public.admin_review_submission(uuid, public.submission_status, text) to authenticated;
grant execute on function public.admin_review_view_report(uuid, public.view_report_status, bigint, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('clipsetu-view-evidence', 'clipsetu-view-evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('clipsetu-payout-receipts', 'clipsetu-payout-receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy view_evidence_upload_own_folder on storage.objects for insert to authenticated
  with check (bucket_id = 'clipsetu-view-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy view_evidence_read_owner_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'clipsetu-view-evidence' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin())));
create policy payout_receipt_upload_own_folder on storage.objects for insert to authenticated
  with check (bucket_id = 'clipsetu-payout-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy payout_receipt_read_owner_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'clipsetu-payout-receipts' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin())));

comment on table public.earnings_ledger is 'Append-only, integer-paise ledger. Client insert/update/delete is intentionally denied.';
comment on table public.campaigns is 'budget_paise is a business-entered plan, not a deposit or escrow; funded_budget_paise is admin-recorded separately.';
comment on table public.view_reports is 'Cumulative snapshots; successive reports must not be added together.';
comment on table private.payout_destinations is 'Restricted payout details; never exposed through PostgREST table access.';
