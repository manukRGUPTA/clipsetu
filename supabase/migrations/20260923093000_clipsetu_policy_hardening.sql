-- Correct authorization edge cases found during the first live RLS review.
-- This migration changes policies/functions only; it does not alter user data.

drop policy if exists participants_request_own_published on public.campaign_participants;
create policy participants_request_own_published on public.campaign_participants for insert to authenticated
  with check (
    clipper_id = (select auth.uid())
    and (select private.has_role('clipper', 'active'))
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_participants.campaign_id
        and c.status = 'published'
        and (
          (campaign_participants.status = 'active' and c.join_mode = 'open')
          or (campaign_participants.status = 'requested' and c.join_mode = 'approval')
        )
    )
  );

drop policy if exists submissions_insert_own_participation on public.submissions;
create policy submissions_insert_own_participation on public.submissions for insert to authenticated
  with check (
    clipper_id = (select auth.uid())
    and status = 'submitted'
    and exists (
      select 1 from public.campaign_participants p
      where p.campaign_id = submissions.campaign_id
        and p.clipper_id = (select auth.uid())
        and p.status = 'active'
    )
    and exists (
      select 1 from public.campaigns c
      where c.id = submissions.campaign_id and c.status = 'published'
    )
  );

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role, p_status public.account_status, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Admin MFA session required' using errcode = '42501'; end if;
  if p_user_id = auth.uid() and p_role = 'admin' then raise exception 'Admins cannot grant admin role to themselves'; end if;
  if p_status in ('rejected', 'suspended') and coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required for rejection or suspension'; end if;
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
  if p_decision in ('rejected', 'suspended') and coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required for rejection or suspension'; end if;
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

drop policy if exists payout_receipt_upload_own_folder on storage.objects;
create policy payout_receipt_upload_admin_paid_request on storage.objects for insert to authenticated
  with check (
    bucket_id = 'clipsetu-payout-receipts'
    and (select private.is_admin())
    and array_length(storage.foldername(name), 1) = 2
    and exists (
      select 1 from public.payout_requests r
      where r.user_id::text = (storage.foldername(name))[1]
        and r.id::text = (storage.foldername(name))[2]
        and r.status = 'paid'
    )
  );

comment on policy payout_receipt_upload_admin_paid_request on storage.objects is
  'Only an MFA-verified admin may upload a receipt under {recipient_user_id}/{paid_payout_request_id}/{filename}.';
