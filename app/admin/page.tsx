import { redirect } from "next/navigation";
import { AdminMfa } from "@/components/admin-mfa";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { reviewBusiness, reviewCampaign, reviewRoleRequest, reviewSubmission } from "./actions";

export const dynamic = "force-dynamic";

function bonusSummary(value: Json) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const rule = entry as Record<string, Json | undefined>;
    return typeof rule.threshold_views === "number" && typeof rule.amount_paise === "number"
      ? [`${rule.threshold_views.toLocaleString("en-IN")} views → ₹${(rule.amount_paise / 100).toLocaleString("en-IN")}`]
      : [];
  });
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const [{ data: claims }, { data: role }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("user_roles").select("user_id, status").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
  ]);
  if (!role || role.status !== "active") redirect("/dashboard");

  if (claims?.claims?.aal !== "aal2") {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    return <div className="auth-wrap"><AdminMfa factors={factors?.totp ?? []} /></div>;
  }

  const [{ data: businesses, error: businessError }, { data: campaigns, error: campaignError }, { data: pendingRoles, error: rolesError }, { data: submissions, error: submissionError }] = await Promise.all([
    supabase.from("businesses").select("id, company_name, owner_id, contact_email, status, created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(50),
    supabase.from("campaigns").select("id, title, business_id, status, source_url, source_rights_confirmed, languages, platforms, starts_at, ends_at, base_reward_paise, budget_paise, bonus_rules, bonus_scope, bonus_stacking, created_at").eq("status", "pending_approval").order("created_at", { ascending: true }).limit(50),
    supabase.from("user_roles").select("user_id, role, status, created_at").eq("status", "pending").eq("role", "clipper").order("created_at", { ascending: true }).limit(50),
    supabase.from("submissions").select("id, campaign_id, clipper_id, source_url, published_url, platform, published_at, notes, status, created_at").in("status", ["submitted", "under_review", "changes_requested"]).order("created_at", { ascending: true }).limit(50),
  ]);
  const pendingProfiles = pendingRoles?.length
    ? await supabase.from("profiles").select("id, full_name").in("id", pendingRoles.map((item) => item.user_id))
    : { data: [], error: null };
  const submissionIds = (submissions ?? []).map((item) => item.id);
  const involvedIds = [...new Set((submissions ?? []).map((item) => item.clipper_id))];
  const campaignIds = [...new Set((submissions ?? []).map((item) => item.campaign_id))];
  const [submissionProfiles, submissionCampaigns, submissionReviews] = await Promise.all([
    involvedIds.length ? supabase.from("profiles").select("id, full_name").in("id", involvedIds) : { data: [], error: null },
    campaignIds.length ? supabase.from("campaigns").select("id, title").in("id", campaignIds) : { data: [], error: null },
    submissionIds.length ? supabase.from("submission_reviews").select("submission_id, decision, reason, created_at").in("submission_id", submissionIds).order("created_at", { ascending: false }) : { data: [], error: null },
  ]);
  const profileNames = new Map((submissionProfiles.data ?? []).map((item) => [item.id, item.full_name]));
  const campaignTitles = new Map((submissionCampaigns.data ?? []).map((item) => [item.id, item.title]));
  const latestReviews = new Map<string, { decision: string; reason: string }>();
  for (const review of submissionReviews.data ?? []) if (!latestReviews.has(review.submission_id)) latestReviews.set(review.submission_id, review);
  const pendingCampaignIds = (campaigns ?? []).map((item) => item.id);
  const { data: campaignTerms } = pendingCampaignIds.length
    ? await supabase.from("campaign_terms").select("campaign_id, version, terms").in("campaign_id", pendingCampaignIds).order("version", { ascending: false })
    : { data: [] };
  const latestTerms = new Map<string, { version: number; terms: import("@/lib/supabase/database.types").Json }>();
  for (const row of campaignTerms ?? []) if (!latestTerms.has(row.campaign_id)) latestTerms.set(row.campaign_id, row);

  return (
    <div className="shell">
      <div className="page-heading"><div><p className="eyebrow">Restricted operations</p><h1>Admin review</h1><p>Every decision is recorded. Role, review, and payment status changes run through database functions.</p></div></div>
      {businessError || campaignError || rolesError || pendingProfiles.error || submissionError || submissionProfiles.error || submissionCampaigns.error || submissionReviews.error ? <div className="notice notice-error">Part of the review queue could not be loaded. Confirm this account has admin MFA and project policies are applied.</div> : null}
      <div className="grid-two">
        <section className="content-panel"><h2>Account role requests <span className="pill">{pendingRoles?.length ?? 0}</span></h2>
          {pendingRoles?.map((request) => {
            const profile = pendingProfiles.data?.find((item) => item.id === request.user_id);
            return <div className="data-list" key={`${request.user_id}-${request.role}`}>
              <div className="data-row"><div>{profile?.full_name || "New member"}<small>{request.role} · submitted {new Date(request.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} IST</small></div></div>
              <form action={reviewRoleRequest} className="actions" style={{ margin: "10px 0 18px" }}>
                <input type="hidden" name="user_id" value={request.user_id} /><input type="hidden" name="role" value={request.role} />
                <label className="sr-only" htmlFor={`role-reason-${request.user_id}`}>Decision reason</label>
                <input id={`role-reason-${request.user_id}`} name="reason" placeholder="Reason required for rejection" maxLength={1000} />
                <button className="button button-small" name="status" value="active">Approve</button>
                <button className="button button-secondary button-small" name="status" value="rejected">Reject</button>
              </form>
            </div>;
          })}
          {!pendingRoles?.length && !rolesError && <p className="muted">No role requests are waiting for review.</p>}
        </section>
        <section className="content-panel"><h2>Business approvals <span className="pill">{businesses?.length ?? 0}</span></h2>
          {businesses?.map((business) => (
            <div className="data-list" key={business.id}>
              <div className="data-row"><div>{business.company_name}<small>{business.contact_email || "No contact email"}</small></div><small>{new Date(business.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} IST</small></div>
              <form action={reviewBusiness} className="actions" style={{ margin: "10px 0 18px" }}>
                <input type="hidden" name="business_id" value={business.id} />
                <label className="sr-only" htmlFor={`reason-${business.id}`}>Decision reason</label>
                <input id={`reason-${business.id}`} name="reason" placeholder="Reason required for rejection" maxLength={1000} />
                <button className="button button-small" name="decision" value="approved">Approve</button>
                <button className="button button-secondary button-small" name="decision" value="rejected">Reject</button>
              </form>
            </div>
          ))}
          {!businesses?.length && !businessError && <p className="muted">No business profiles are waiting for review.</p>}
        </section>
        <section className="content-panel"><h2>Campaign approvals <span className="pill">{campaigns?.length ?? 0}</span></h2>
          {campaigns?.map((campaign) => (
            <div className="data-list" key={campaign.id}>
              <div className="data-row"><div>{campaign.title}<small>Base ₹{(campaign.base_reward_paise / 100).toLocaleString("en-IN")} · budget ₹{(campaign.budget_paise / 100).toLocaleString("en-IN")}</small></div><a href={campaign.source_url ?? "#"} rel="noreferrer" target="_blank">Source ↗</a></div>
              <p className="field-help">Rights confirmed: {campaign.source_rights_confirmed ? "Yes" : "No"} · platforms: {campaign.platforms.map((item) => item.replaceAll("_", " ")).join(", ") || "none"} · languages: {campaign.languages.join(", ") || "none"}. Budget is not escrow.</p>
              <p className="field-help">Schedule: {campaign.starts_at ? new Date(campaign.starts_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "Starts when published"} – {campaign.ends_at ? new Date(campaign.ends_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "No end date"}</p>
              {bonusSummary(campaign.bonus_rules).length > 0 && <p className="field-help">View bonuses: {bonusSummary(campaign.bonus_rules).join("; ")} · {campaign.bonus_scope?.replaceAll("_", " ")} · {campaign.bonus_stacking?.replaceAll("_", " ")}</p>}
              {(() => {
                const value = latestTerms.get(campaign.id)?.terms;
                const brief = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json | undefined> : {};
                return <div className="admin-brief"><p><strong>Clip requirements:</strong> {typeof brief.clip_requirements === "string" ? brief.clip_requirements : "Not set"}</p><p><strong>Content guidelines:</strong> {typeof brief.content_guidelines === "string" ? brief.content_guidelines : "Not set"}</p><p><strong>Disclosure:</strong> {typeof brief.disclosure === "string" ? brief.disclosure : "None provided"}</p></div>;
              })()}
              <form action={reviewCampaign} className="actions" style={{ margin: "10px 0 18px" }}>
                <input type="hidden" name="campaign_id" value={campaign.id} />
                <label className="sr-only" htmlFor={`campaign-reason-${campaign.id}`}>Decision reason</label>
                <input id={`campaign-reason-${campaign.id}`} name="reason" placeholder="Reason required for edits or rejection" maxLength={1000} />
                <button className="button button-small" name="decision" value="published">Publish</button>
                <button className="button button-secondary button-small" name="decision" value="changes_requested">Request edits</button>
                <button className="button button-secondary button-small" name="decision" value="rejected">Reject</button>
              </form>
            </div>
          ))}
          {!campaigns?.length && !campaignError && <p className="muted">No campaigns are waiting for review.</p>}
        </section>
        <section className="content-panel submission-review-queue"><h2>Clip submissions <span className="pill">{submissions?.length ?? 0}</span></h2>
          {submissions?.map((submission) => {
            const lastReview = latestReviews.get(submission.id);
            return <article className="review-item" key={submission.id}>
              <div className="data-row"><div>{campaignTitles.get(submission.campaign_id) ?? "Campaign"}<small>{profileNames.get(submission.clipper_id) || "Clipper"} · {submission.platform.replaceAll("_", " ")} · {submission.status.replaceAll("_", " ")}</small></div><small>{new Date(submission.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} IST</small></div>
              <div className="review-links"><a href={submission.published_url} target="_blank" rel="noreferrer">Published clip ↗</a><a href={submission.source_url} target="_blank" rel="noreferrer">Source content ↗</a></div>
              {submission.notes && <p className="field-help">Clipper note: {submission.notes}</p>}
              {lastReview?.reason && <p className="review-note"><strong>Previous {lastReview.decision.replaceAll("_", " ")}:</strong> {lastReview.reason}</p>}
              <form action={reviewSubmission} className="actions review-decision-form">
                <input type="hidden" name="submission_id" value={submission.id} />
                <label className="sr-only" htmlFor={`submission-reason-${submission.id}`}>Review reason</label>
                <input id={`submission-reason-${submission.id}`} name="reason" maxLength={2000} placeholder="Reason required for correction or rejection" />
                <button className="button button-small" name="decision" value="accepted">Accept</button>
                <button className="button button-secondary button-small" name="decision" value="changes_requested">Request correction</button>
                <button className="button button-secondary button-small" name="decision" value="rejected">Reject</button>
              </form>
            </article>;
          })}
          {!submissions?.length && !submissionError && <p className="muted">No clip submissions are waiting for review.</p>}
        </section>
      </div>
    </div>
  );
}
