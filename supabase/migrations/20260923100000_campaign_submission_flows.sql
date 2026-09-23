-- Campaign creation, join, and submission workflows.
-- Additive and data-preserving: no rows or existing migrations are removed.

alter table public.campaigns
  add constraint campaigns_source_url_https
    check (source_url is null or (char_length(source_url) <= 2048 and source_url ~* '^https://[^./@[:space:]]+(\.[^./@[:space:]]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$')),
  add constraint campaigns_base_reward_within_budget
    check (budget_paise = 0 or base_reward_paise <= budget_paise),
  add constraint campaigns_zero_budget_zero_reward
    check (budget_paise > 0 or base_reward_paise = 0),
  add constraint campaigns_platforms_allowed
    check (platforms <@ array['instagram_reels', 'youtube_shorts', 'tiktok', 'other']::text[]);

alter table public.submissions
  add constraint submissions_source_url_https
    check (char_length(source_url) <= 2048 and source_url ~* '^https://[^./@[:space:]]+(\.[^./@[:space:]]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$'),
  add constraint submissions_published_url_public_https
    check (char_length(published_url) <= 2048 and published_url ~* '^https://[^./@[:space:]]+(\.[^./@[:space:]]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$');

create or replace function private.campaign_bonus_rules_valid(p_rules jsonb, p_scope text, p_stacking text)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_rules) <> 'array' then return false; end if;
  if jsonb_array_length(p_rules) > 10 then return false; end if;
  if jsonb_array_length(p_rules) = 0 then return p_scope is null and p_stacking is null; end if;
  if coalesce(p_scope, '') not in ('per_clip', 'per_clipper', 'per_campaign')
    or coalesce(p_stacking, '') not in ('cumulative', 'highest_only') then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(p_rules) as r(value)
    where jsonb_typeof(r.value) <> 'object'
      or coalesce(r.value->>'threshold_views', '') !~ '^[1-9][0-9]{0,11}$'
      or coalesce(r.value->>'amount_paise', '') !~ '^[1-9][0-9]{0,11}$'
  ) then return false; end if;
  return (select count(*) from jsonb_array_elements(p_rules)) =
    (select count(distinct r.value->>'threshold_views') from jsonb_array_elements(p_rules) as r(value));
end;
$$;
revoke all on function private.campaign_bonus_rules_valid(jsonb, text, text) from public, anon;
grant execute on function private.campaign_bonus_rules_valid(jsonb, text, text) to authenticated;

create or replace function private.publication_url_matches_platform(p_url text, p_platform text)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v_host text;
begin
  if p_url is null or p_platform is null or char_length(p_url) > 2048
    or p_url !~* '^https://[^./@[:space:]]+(\.[^./@[:space:]]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$' then
    return false;
  end if;
  v_host := lower(split_part(split_part(p_url, '://', 2), '/', 1));
  v_host := split_part(v_host, ':', 1);
  if p_platform = 'instagram_reels' then return v_host = 'instagram.com' or v_host like '%.instagram.com'; end if;
  if p_platform = 'youtube_shorts' then return v_host = 'youtu.be' or v_host like '%.youtube.com' or v_host = 'youtube.com'; end if;
  if p_platform = 'tiktok' then return v_host = 'tiktok.com' or v_host like '%.tiktok.com'; end if;
  return p_platform = 'other';
end;
$$;
revoke all on function private.publication_url_matches_platform(text, text) from public, anon;
grant execute on function private.publication_url_matches_platform(text, text) to authenticated;

alter table public.submissions
  add constraint submissions_platform_matches_published_url
  check (private.publication_url_matches_platform(published_url, platform));

alter table public.campaigns
  add constraint campaigns_bonus_rules_valid
  check (private.campaign_bonus_rules_valid(bonus_rules, bonus_scope, bonus_stacking));

create or replace function private.snapshot_submission_terms()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.campaigns%rowtype;
  v_version integer;
  v_terms jsonb;
begin
  select * into c from public.campaigns where id = new.campaign_id;
  if not found then raise exception 'Campaign not found'; end if;

  select t.version, t.terms into v_version, v_terms
  from public.campaign_terms t
  where t.campaign_id = c.id
  order by t.version desc
  limit 1;

  new.terms_snapshot := jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'source_url', c.source_url,
      'platforms', c.platforms,
      'languages', c.languages,
      'budget_paise', c.budget_paise,
      'base_reward_paise', c.base_reward_paise,
      'bonus_rules', c.bonus_rules,
      'bonus_scope', c.bonus_scope,
      'bonus_stacking', c.bonus_stacking,
      'currency', 'INR'
    ),
    'terms_version', coalesce(v_version, 1),
    'terms', coalesce(v_terms, '{}'::jsonb)
  );
  return new;
end;
$$;

create or replace function public.save_campaign_draft(
  p_campaign_id uuid,
  p_business_id uuid,
  p_title text,
  p_description text,
  p_source_url text,
  p_source_rights_confirmed boolean,
  p_languages text[],
  p_platforms text[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_budget_paise bigint,
  p_base_reward_paise bigint,
  p_join_mode public.join_mode,
  p_bonus_rules jsonb,
  p_bonus_scope text,
  p_bonus_stacking text,
  p_terms jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_campaign public.campaigns%rowtype;
  v_languages text[] := coalesce(p_languages, '{}'::text[]);
  v_platforms text[] := coalesce(p_platforms, '{}'::text[]);
  v_bonus_rules jsonb := coalesce(p_bonus_rules, '[]'::jsonb);
begin
  if auth.uid() is null or not private.has_role('business', 'active') then
    raise exception 'Active business account required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = auth.uid() and b.status = 'approved'
  ) then
    raise exception 'Approved business profile required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 3 and 180 then raise exception 'Campaign title must be 3–180 characters'; end if;
  if char_length(coalesce(p_description, '')) > 4000 then raise exception 'Campaign description is too long'; end if;
  if p_source_url is not null and (p_source_url !~* '^https://[^./@[:space:]]+(\.[^./@[:space:]]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$' or char_length(p_source_url) > 2048) then raise exception 'Source link must be a valid public HTTPS URL'; end if;
  if coalesce(cardinality(v_languages), 0) > 12
    or exists (select 1 from unnest(v_languages) as lang(value) where char_length(trim(value)) not between 2 and 40)
  then raise exception 'Use no more than 12 valid campaign languages'; end if;
  if coalesce(cardinality(v_platforms), 0) > 4
    or not (v_platforms <@ array['instagram_reels', 'youtube_shorts', 'tiktok', 'other']::text[])
  then raise exception 'Choose only supported publishing platforms'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then raise exception 'Campaign end must be after its start'; end if;
  if p_budget_paise is null or p_budget_paise < 0 or p_budget_paise > 1000000000000 then raise exception 'Enter a valid campaign budget'; end if;
  if p_base_reward_paise is null or p_base_reward_paise < 0 or p_base_reward_paise > p_budget_paise then raise exception 'Per-clip reward must be non-negative and no greater than the campaign budget'; end if;
  if p_join_mode is null then raise exception 'Choose how clippers can join'; end if;

  if jsonb_typeof(v_bonus_rules) <> 'array' then raise exception 'Bonus rules must be a list'; end if;
  if jsonb_array_length(v_bonus_rules) > 10 then raise exception 'A campaign can have at most 10 view milestones'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_bonus_rules) as r(value)
    where jsonb_typeof(r.value) <> 'object'
      or coalesce(r.value->>'threshold_views', '') !~ '^[1-9][0-9]{0,11}$'
      or coalesce(r.value->>'amount_paise', '') !~ '^[1-9][0-9]{0,11}$'
  ) then raise exception 'Each bonus needs a positive view threshold and INR amount'; end if;
  if jsonb_array_length(v_bonus_rules) > 0 then
    if coalesce(p_bonus_scope, '') not in ('per_clip', 'per_clipper', 'per_campaign')
      or coalesce(p_bonus_stacking, '') not in ('cumulative', 'highest_only') then
      raise exception 'Choose the scope and stacking rule for view bonuses';
    end if;
    if (select count(*) from jsonb_array_elements(v_bonus_rules)) <>
      (select count(distinct r.value->>'threshold_views') from jsonb_array_elements(v_bonus_rules) as r(value))
    then raise exception 'View bonus thresholds must be unique'; end if;
  elsif p_bonus_scope is not null or p_bonus_stacking is not null then
    raise exception 'Remove bonus settings or add at least one view milestone';
  end if;

  if jsonb_typeof(p_terms) <> 'object'
    or coalesce(jsonb_typeof(p_terms->'clip_requirements'), '') <> 'string'
    or coalesce(jsonb_typeof(p_terms->'content_guidelines'), '') <> 'string'
    or char_length(coalesce(p_terms->>'clip_requirements', '')) > 4000
    or char_length(coalesce(p_terms->>'content_guidelines', '')) > 4000 then
    raise exception 'Campaign brief fields must be an object with text under 4,000 characters';
  end if;
  if char_length(coalesce(p_terms->>'disclosure', '')) > 1000 then raise exception 'Disclosure guidance is too long'; end if;

  if p_campaign_id is null then
    insert into public.campaigns (
      business_id, created_by, title, description, source_url, source_rights_confirmed,
      languages, platforms, starts_at, ends_at, budget_paise, base_reward_paise,
      join_mode, bonus_rules, bonus_scope, bonus_stacking, status
    ) values (
      p_business_id, auth.uid(), trim(p_title), coalesce(p_description, ''), p_source_url,
      coalesce(p_source_rights_confirmed, false), v_languages, v_platforms, p_starts_at,
      p_ends_at, p_budget_paise, p_base_reward_paise, p_join_mode, v_bonus_rules,
      p_bonus_scope, p_bonus_stacking, 'draft'
    ) returning id into v_campaign_id;
  else
    select * into v_campaign from public.campaigns where id = p_campaign_id for update;
    if not found or v_campaign.business_id <> p_business_id
      or v_campaign.created_by <> auth.uid()
      or v_campaign.status not in ('draft', 'changes_requested') then
      raise exception 'Only your editable campaign drafts can be changed' using errcode = '42501';
    end if;
    update public.campaigns set
      title = trim(p_title), description = coalesce(p_description, ''), source_url = p_source_url,
      source_rights_confirmed = coalesce(p_source_rights_confirmed, false),
      languages = v_languages, platforms = v_platforms, starts_at = p_starts_at,
      ends_at = p_ends_at, budget_paise = p_budget_paise, base_reward_paise = p_base_reward_paise,
      join_mode = p_join_mode, bonus_rules = v_bonus_rules, bonus_scope = p_bonus_scope,
      bonus_stacking = p_bonus_stacking, status_reason = null, updated_at = now()
    where id = p_campaign_id
    returning id into v_campaign_id;
  end if;

  insert into public.campaign_terms(campaign_id, version, terms, created_by)
  select v_campaign_id, coalesce(max(t.version), 0) + 1, p_terms, auth.uid()
  from public.campaign_terms t where t.campaign_id = v_campaign_id;

  insert into public.audit_events(actor_user_id, action, target_type, target_id)
  values (auth.uid(), case when p_campaign_id is null then 'campaign.draft_created' else 'campaign.draft_updated' end,
    'campaign', v_campaign_id::text);
  return v_campaign_id;
end;
$$;

create or replace function public.request_campaign_review(p_campaign_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.campaigns%rowtype;
  t jsonb;
begin
  if auth.uid() is null or not private.has_role('business', 'active') then
    raise exception 'Active business account required' using errcode = '42501';
  end if;
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found or not exists (
    select 1 from public.businesses b
    where b.id = c.business_id and b.owner_id = auth.uid() and b.status = 'approved'
  ) then raise exception 'Campaign not found or not owned by this business' using errcode = '42501'; end if;
  if c.status not in ('draft', 'changes_requested') then raise exception 'Campaign is not editable'; end if;
  select terms into t from public.campaign_terms where campaign_id = c.id order by version desc limit 1;
  if c.source_url is null or c.source_url !~* '^https://[^./@[:space:]]+(\.[^./@[:space:]]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$'
    or not c.source_rights_confirmed or c.base_reward_paise <= 0 or c.budget_paise <= 0
    or c.base_reward_paise > c.budget_paise or cardinality(c.languages) = 0
    or cardinality(c.platforms) = 0 or t is null
    or char_length(trim(coalesce(t->>'clip_requirements', ''))) < 12
    or char_length(trim(coalesce(t->>'content_guidelines', ''))) < 12
    or (c.ends_at is not null and c.ends_at <= now()) then
    raise exception 'Campaign needs an authorized HTTPS source, complete brief, language/platform, and valid INR rewards';
  end if;
  if coalesce(jsonb_typeof(t->'clip_requirements'), '') <> 'string'
    or coalesce(jsonb_typeof(t->'content_guidelines'), '') <> 'string' then
    raise exception 'Campaign brief requirements and guidelines must be text';
  end if;
  update public.campaigns set status = 'pending_approval', status_reason = null, updated_at = now() where id = c.id;
  insert into public.audit_events(actor_user_id, action, target_type, target_id)
  values (auth.uid(), 'campaign.submitted_for_review', 'campaign', c.id::text);
end;
$$;

create or replace function public.admin_review_campaign(p_campaign_id uuid, p_decision public.campaign_status, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.campaigns%rowtype;
  t jsonb;
begin
  if not private.is_admin() then raise exception 'Admin MFA session required' using errcode = '42501'; end if;
  if p_decision not in ('published', 'changes_requested', 'rejected') then raise exception 'Invalid campaign decision'; end if;
  if p_decision in ('changes_requested', 'rejected') and coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found or c.status <> 'pending_approval' then raise exception 'Campaign is not awaiting review'; end if;
  if p_decision = 'published' then
    select terms into t from public.campaign_terms where campaign_id = c.id order by version desc limit 1;
    if c.source_url is null or not c.source_rights_confirmed or c.base_reward_paise <= 0
      or c.budget_paise <= 0 or c.base_reward_paise > c.budget_paise
      or cardinality(c.languages) = 0 or cardinality(c.platforms) = 0
      or (c.ends_at is not null and c.ends_at <= now())
      or coalesce(jsonb_typeof(t->'clip_requirements'), '') <> 'string'
      or char_length(trim(coalesce(t->>'clip_requirements', ''))) < 12
      or coalesce(jsonb_typeof(t->'content_guidelines'), '') <> 'string'
      or char_length(trim(coalesce(t->>'content_guidelines', ''))) < 12 then
      raise exception 'Campaign source rights, brief, schedule, or INR terms are incomplete';
    end if;
  end if;
  update public.campaigns set status = p_decision, status_reason = left(p_reason, 1000), updated_at = now() where id = c.id;
  insert into public.audit_events(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'campaign.reviewed', 'campaign', c.id::text,
    jsonb_build_object('decision', p_decision, 'reason', left(p_reason, 1000)));
end;
$$;

create or replace function public.join_campaign(p_campaign_id uuid)
returns public.participation_status
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.campaigns%rowtype;
  v_status public.participation_status;
begin
  if auth.uid() is null or not private.has_role('clipper', 'active') then
    raise exception 'Active clipper account required' using errcode = '42501';
  end if;
  select * into c from public.campaigns where id = p_campaign_id for share;
  if not found or c.status <> 'published' or c.created_by = auth.uid()
    or (c.starts_at is not null and c.starts_at > now())
    or (c.ends_at is not null and c.ends_at < now()) then
    raise exception 'Campaign is not currently open to join';
  end if;
  if not exists (select 1 from public.campaign_terms t where t.campaign_id = c.id) then
    raise exception 'Campaign terms are unavailable';
  end if;
  v_status := case when c.join_mode = 'open' then 'active'::public.participation_status else 'requested'::public.participation_status end;
  insert into public.campaign_participants(campaign_id, clipper_id, status)
  values (c.id, auth.uid(), v_status)
  on conflict (campaign_id, clipper_id) do update
    set status = excluded.status, joined_at = now(), decided_by = null, decision_reason = null
    where public.campaign_participants.status = 'left'
  returning status into v_status;
  if not found then
    select p.status into v_status from public.campaign_participants p
    where p.campaign_id = c.id and p.clipper_id = auth.uid();
  else
    insert into public.audit_events(actor_user_id, action, target_type, target_id, details)
    values (auth.uid(), 'campaign.participation_requested', 'campaign', c.id::text,
      jsonb_build_object('status', v_status));
  end if;
  return v_status;
end;
$$;

create or replace function public.business_decide_participation(
  p_campaign_id uuid,
  p_clipper_id uuid,
  p_decision public.participation_status,
  p_reason text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.campaigns%rowtype;
begin
  if auth.uid() is null or not private.has_role('business', 'active') then
    raise exception 'Active business account required' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('active', 'declined') then raise exception 'Invalid participation decision'; end if;
  if p_decision = 'declined' and coalesce(trim(p_reason), '') = '' then raise exception 'Add a reason for declining this request'; end if;
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found or c.join_mode <> 'approval' or c.status not in ('published', 'paused')
    or not exists (select 1 from public.businesses b where b.id = c.business_id and b.owner_id = auth.uid() and b.status = 'approved') then
    raise exception 'Campaign is not managed by this business' using errcode = '42501';
  end if;
  update public.campaign_participants set status = p_decision, decided_by = auth.uid(),
    decision_reason = left(p_reason, 1000)
  where campaign_id = c.id and clipper_id = p_clipper_id and status = 'requested';
  if not found then raise exception 'Participation request is no longer pending'; end if;
  insert into public.audit_events(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'campaign.participation_decided', 'campaign', c.id::text,
    jsonb_build_object('clipper_id', p_clipper_id, 'decision', p_decision, 'reason', left(p_reason, 1000)));
end;
$$;

create or replace function public.submit_clip(
  p_campaign_id uuid,
  p_source_url text,
  p_published_url text,
  p_platform text,
  p_published_at timestamptz,
  p_notes text default ''
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.campaigns%rowtype;
  v_submission_id uuid;
begin
  if auth.uid() is null or not private.has_role('clipper', 'active') then
    raise exception 'Active clipper account required' using errcode = '42501';
  end if;
  select * into c from public.campaigns where id = p_campaign_id for share;
  if not found or c.status <> 'published' or c.created_by = auth.uid()
    or (c.starts_at is not null and c.starts_at > now())
    or (c.ends_at is not null and c.ends_at < now()) then
    raise exception 'Campaign is not currently accepting submissions';
  end if;
  if not exists (select 1 from public.campaign_participants p
    where p.campaign_id = c.id and p.clipper_id = auth.uid() and p.status = 'active') then
    raise exception 'Join the campaign and wait for approval before submitting';
  end if;
  if p_source_url !~* '^https://[^./@[:space:]]+(\.[^./@[:space:]]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$'
    or p_published_url !~* '^https://[^./@[:space:]]+(\.[^./@[:space:]]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$' then
    raise exception 'Both source and published clip must use HTTPS links';
  end if;
  if p_platform not in ('instagram_reels', 'youtube_shorts', 'tiktok', 'other') then raise exception 'Choose a supported platform'; end if;
  if not (p_platform = any(c.platforms)) then raise exception 'Choose a platform allowed by this campaign'; end if;
  if not private.publication_url_matches_platform(p_published_url, p_platform) then raise exception 'Published URL does not match the selected platform'; end if;
  if p_published_at is null or p_published_at > now()
    or (c.starts_at is not null and p_published_at < c.starts_at)
    or (c.ends_at is not null and p_published_at > c.ends_at) then
    raise exception 'Publication date must be within the campaign period';
  end if;
  if char_length(coalesce(p_notes, '')) > 2000 then raise exception 'Submission notes are too long'; end if;

  insert into public.submissions(campaign_id, clipper_id, source_url, published_url, platform, published_at, notes)
  values (c.id, auth.uid(), p_source_url, p_published_url, p_platform, p_published_at, coalesce(p_notes, ''))
  returning id into v_submission_id;
  insert into public.audit_events(actor_user_id, action, target_type, target_id)
  values (auth.uid(), 'submission.created', 'submission', v_submission_id::text);
  return v_submission_id;
end;
$$;

create or replace function public.resubmit_clip(
  p_submission_id uuid,
  p_source_url text,
  p_published_url text,
  p_platform text,
  p_published_at timestamptz,
  p_notes text default ''
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  s public.submissions%rowtype;
  c public.campaigns%rowtype;
begin
  if auth.uid() is null or not private.has_role('clipper', 'active') then
    raise exception 'Active clipper account required' using errcode = '42501';
  end if;
  select * into s from public.submissions where id = p_submission_id for update;
  if not found or s.clipper_id <> auth.uid() or s.status <> 'changes_requested' then
    raise exception 'Only your correction-requested submissions can be resubmitted' using errcode = '42501';
  end if;
  select * into c from public.campaigns where id = s.campaign_id for share;
  if p_source_url !~* '^https://[^./@[:space:]]+(\.[^./@[:space:]]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$'
    or p_published_url !~* '^https://[^./@[:space:]]+(\.[^./@[:space:]]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$'
    or p_platform not in ('instagram_reels', 'youtube_shorts', 'tiktok', 'other')
    or not (p_platform = any(c.platforms))
    or not private.publication_url_matches_platform(p_published_url, p_platform)
    or p_published_at is null or p_published_at > now()
    or (c.starts_at is not null and p_published_at < c.starts_at)
    or (c.ends_at is not null and p_published_at > c.ends_at)
    or char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Check both HTTPS links, platform, publication date, and notes';
  end if;
  update public.submissions set source_url = p_source_url, published_url = p_published_url,
    platform = p_platform, published_at = p_published_at, notes = coalesce(p_notes, ''),
    status = 'submitted', updated_at = now()
  where id = s.id;
  insert into public.audit_events(actor_user_id, action, target_type, target_id)
  values (auth.uid(), 'submission.resubmitted', 'submission', s.id::text);
end;
$$;

drop policy if exists participants_request_own_published on public.campaign_participants;
create policy participants_request_own_published on public.campaign_participants for insert to authenticated
  with check (
    clipper_id = (select auth.uid())
    and (select private.has_role('clipper', 'active'))
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_participants.campaign_id
        and c.status = 'published'
        and c.created_by <> (select auth.uid())
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at >= now())
        and exists (select 1 from public.campaign_terms t where t.campaign_id = c.id)
        and (
          (campaign_participants.status = 'active' and c.join_mode = 'open')
          or (campaign_participants.status = 'requested' and c.join_mode = 'approval')
        )
    )
  );

create policy profiles_read_campaign_participants on public.profiles for select to authenticated
  using (exists (
    select 1 from public.campaign_participants p
    join public.campaigns c on c.id = p.campaign_id
    join public.businesses b on b.id = c.business_id
    where p.clipper_id = profiles.id and b.owner_id = (select auth.uid())
  ));

drop policy if exists submissions_insert_own_participation on public.submissions;
create policy submissions_insert_own_participation on public.submissions for insert to authenticated
  with check (
    clipper_id = (select auth.uid())
    and status = 'submitted'
    and published_at <= now()
    and exists (
      select 1 from public.campaign_participants p
      where p.campaign_id = submissions.campaign_id
        and p.clipper_id = (select auth.uid())
        and p.status = 'active'
    )
    and exists (
      select 1 from public.campaigns c
      where c.id = submissions.campaign_id and c.status = 'published'
        and c.created_by <> (select auth.uid())
        and submissions.platform = any(c.platforms)
        and (c.starts_at is null or c.starts_at <= submissions.published_at)
        and (c.ends_at is null or c.ends_at >= submissions.published_at)
        and exists (select 1 from public.campaign_terms t where t.campaign_id = c.id)
    )
  );

create policy submission_reviews_read_involved on public.submission_reviews for select to authenticated
  using (
    exists (select 1 from public.submissions s where s.id = submission_id and s.clipper_id = (select auth.uid()))
    or exists (
      select 1 from public.submissions s
      join public.campaigns c on c.id = s.campaign_id
      join public.businesses b on b.id = c.business_id
      where s.id = submission_id and b.owner_id = (select auth.uid())
    )
  );

revoke all on function public.save_campaign_draft(uuid, uuid, text, text, text, boolean, text[], text[], timestamptz, timestamptz, bigint, bigint, public.join_mode, jsonb, text, text, jsonb) from public, anon;
revoke all on function public.request_campaign_review(uuid) from public, anon;
revoke all on function public.join_campaign(uuid) from public, anon;
revoke all on function public.business_decide_participation(uuid, uuid, public.participation_status, text) from public, anon;
revoke all on function public.submit_clip(uuid, text, text, text, timestamptz, text) from public, anon;
revoke all on function public.resubmit_clip(uuid, text, text, text, timestamptz, text) from public, anon;
-- Route state changes through the guarded, auditable RPCs; table reads remain RLS-scoped.
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
grant execute on function public.save_campaign_draft(uuid, uuid, text, text, text, boolean, text[], text[], timestamptz, timestamptz, bigint, bigint, public.join_mode, jsonb, text, text, jsonb) to authenticated;
grant execute on function public.request_campaign_review(uuid) to authenticated;
grant execute on function public.join_campaign(uuid) to authenticated;
grant execute on function public.business_decide_participation(uuid, uuid, public.participation_status, text) to authenticated;
grant execute on function public.submit_clip(uuid, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.resubmit_clip(uuid, text, text, text, timestamptz, text) to authenticated;

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

-- Authenticated clipper-facing brand directory exposes names only, never contact fields.
create or replace view public.published_campaign_business_directory as
  select distinct b.id, b.company_name
  from public.businesses b
  join public.campaigns c on c.business_id = b.id
  where c.status = 'published';
revoke all on public.published_campaign_business_directory from public, anon;
grant select on public.published_campaign_business_directory to authenticated;
