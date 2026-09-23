import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CampaignForm, RequestCampaignReviewForm } from "@/components/campaign-form";
import { ParticipationDecisionForm } from "@/components/campaign-actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; submitted?: string; participant?: string }> };

function termsObject(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json | undefined> : {};
}

export default async function ManageCampaignPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const [{ data: business }, { data: role }] = await Promise.all([
    supabase.from("businesses").select("id, company_name, status").eq("owner_id", user.id).maybeSingle(),
    supabase.from("user_roles").select("status").eq("user_id", user.id).eq("role", "business").maybeSingle(),
  ]);
  if (!business || !role || role.status !== "active") redirect("/dashboard/campaigns");

  const { data: campaign, error } = await supabase.from("campaigns").select("*").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (error || !campaign) notFound();
  const [{ data: termsRows }, { data: participants }, { data: submissions }] = await Promise.all([
    supabase.from("campaign_terms").select("version, terms, created_at").eq("campaign_id", campaign.id).order("version", { ascending: false }).limit(1),
    supabase.from("campaign_participants").select("campaign_id, clipper_id, status, joined_at, decision_reason").eq("campaign_id", campaign.id).order("joined_at", { ascending: false }).limit(100),
    supabase.from("submissions").select("id, clipper_id, published_url, platform, status, created_at").eq("campaign_id", campaign.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const peopleIds = [...new Set([...(participants ?? []).map((item) => item.clipper_id), ...(submissions ?? []).map((item) => item.clipper_id)])];
  const profiles = peopleIds.length ? await supabase.from("profiles").select("id, full_name").in("id", peopleIds) : { data: [], error: null };
  const names = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.full_name]));
  const terms = termsRows?.[0]?.terms ?? null;
  const brief = termsObject(terms);
  const editable = campaign.status === "draft" || campaign.status === "changes_requested";
  const pendingParticipants = (participants ?? []).filter((item) => item.status === "requested");

  return (
    <div className="shell">
      <div className="page-heading"><div><p className="eyebrow">{business.company_name}</p><h1>{campaign.title}</h1><p>Campaign status: <span className={`status-pill ${campaign.status === "published" ? "active" : ""}`}>{campaign.status.replaceAll("_", " ")}</span></p></div><Link className="button button-secondary button-small" href="/dashboard/campaigns">All campaigns</Link></div>
      {query.saved && <p className="form-message">Draft saved. The brief has a new terms version.</p>}
      {query.submitted && <p className="form-message">Campaign submitted. It stays hidden from discovery until an admin publishes it.</p>}
      {query.participant && <p className="form-message">Participation decision saved.</p>}
      {campaign.status_reason && <div className="notice">Admin review note: {campaign.status_reason}</div>}

      {editable ? <>
        <section className="content-panel workflow-panel"><h2>Edit campaign draft</h2><CampaignForm businessId={business.id} campaign={campaign} terms={terms} /></section>
        <section className="content-panel review-submit"><h2>Ready for review?</h2><p>Admin review checks source permission, brief clarity, and published reward terms. Submission does not reserve funds or guarantee a payout.</p><RequestCampaignReviewForm campaignId={campaign.id} /></section>
      </> : <>
        <section className="content-panel"><h2>Campaign terms · version {termsRows?.[0]?.version ?? "—"}</h2><dl className="terms-list"><div><dt>Clip requirements</dt><dd>{String(brief.clip_requirements ?? "Not set")}</dd></div><div><dt>Content guidelines</dt><dd>{String(brief.content_guidelines ?? "Not set")}</dd></div><div><dt>Disclosure</dt><dd>{String(brief.disclosure ?? "No special disclosure guidance")}</dd></div></dl><p className="field-help">Source rights confirmed: {campaign.source_rights_confirmed ? "Yes" : "No"} · Source: {campaign.source_url ? <a href={campaign.source_url} target="_blank" rel="noreferrer">Open authorized source ↗</a> : "Not set"}</p></section>
        {campaign.join_mode === "approval" && <section className="content-panel"><h2>Join requests <span className="pill">{pendingParticipants.length}</span></h2>{pendingParticipants.length ? pendingParticipants.map((participant) => { const name = names.get(participant.clipper_id) || "Clipper"; return <div className="data-list" key={participant.clipper_id}><div className="data-row"><div>{name}<small>Requested {new Date(participant.joined_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} IST</small></div></div><ParticipationDecisionForm campaignId={campaign.id} clipperId={participant.clipper_id} clipperName={name} /></div>; }) : <p className="muted">No clipper requests are waiting for a decision.</p>}</section>}
        <section className="content-panel"><h2>Recent submissions</h2>{submissions?.length ? <div className="data-list">{submissions.map((submission) => <div className="data-row" key={submission.id}><div>{names.get(submission.clipper_id) || "Clipper"}<small>{submission.platform.replaceAll("_", " ")} · {submission.status.replaceAll("_", " ")}</small></div><a href={submission.published_url} target="_blank" rel="noreferrer">View post ↗</a></div>)}</div> : <p className="muted">No clips submitted yet.</p>}</section>
      </>}
    </div>
  );
}
