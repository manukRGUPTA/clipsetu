-- Completes the campaign workflow access layer with small, idempotent statements.
-- This is additive; it does not change or remove application data.

grant execute on function public.submit_clip(uuid, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.resubmit_clip(uuid, text, text, text, timestamptz, text) to authenticated;

revoke insert (business_id, created_by, title, description, source_url, source_rights_confirmed,
  languages, platforms, starts_at, ends_at, budget_paise, base_reward_paise, join_mode,
  bonus_rules, bonus_scope, bonus_stacking) on public.campaigns from authenticated;
revoke update (title, description, source_url, source_rights_confirmed, languages, platforms,
  starts_at, ends_at, budget_paise, base_reward_paise, join_mode, bonus_rules, bonus_scope,
  bonus_stacking) on public.campaigns from authenticated;
revoke insert (campaign_id, version, terms, created_by) on public.campaign_terms from authenticated;
revoke insert (campaign_id, clipper_id) on public.campaign_participants from authenticated;
revoke insert (campaign_id, clipper_id, source_url, published_url, platform, published_at, notes) on public.submissions from authenticated;
revoke update (source_url, published_url, platform, published_at, notes) on public.submissions from authenticated;

create index if not exists campaigns_published_discovery_idx
  on public.campaigns (created_at desc) where status = 'published';
create index if not exists campaigns_business_created_idx
  on public.campaigns (business_id, created_at desc);
create index if not exists participants_clipper_joined_idx
  on public.campaign_participants (clipper_id, joined_at desc);
create index if not exists submissions_clipper_created_idx
  on public.submissions (clipper_id, created_at desc);
create index if not exists submissions_campaign_created_idx
  on public.submissions (campaign_id, created_at desc);
create index if not exists submission_reviews_submission_created_idx
  on public.submission_reviews (submission_id, created_at desc);

create or replace view public.published_campaign_business_directory
with (security_barrier = true, security_invoker = false)
as
  select distinct b.id, b.company_name
  from public.businesses b
  join public.campaigns c on c.business_id = b.id
  where c.status = 'published';
revoke all on public.published_campaign_business_directory from public, anon;
grant select on public.published_campaign_business_directory to authenticated;
