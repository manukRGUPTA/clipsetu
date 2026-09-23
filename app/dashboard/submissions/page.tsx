import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipSubmissionForm } from "@/components/campaign-actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ submitted?: string; resubmitted?: string }> };
const statusLabel: Record<string, string> = {
  submitted: "Submitted", under_review: "Under review", changes_requested: "Changes requested",
  accepted: "Accepted", rejected: "Rejected", withdrawn: "Withdrawn",
};

function istDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function MySubmissionsPage({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: role } = await supabase.from("user_roles").select("status").eq("user_id", user.id).eq("role", "clipper").maybeSingle();
  if (!role || role.status !== "active") redirect("/onboarding");

  const { data: submissions, error } = await supabase.from("submissions").select("id, campaign_id, source_url, published_url, platform, published_at, notes, status, created_at").eq("clipper_id", user.id).order("created_at", { ascending: false }).limit(100);
  const campaignIds = [...new Set((submissions ?? []).map((item) => item.campaign_id))];
  const submissionIds = (submissions ?? []).map((item) => item.id);
  const [campaigns, reviews] = await Promise.all([
    campaignIds.length ? supabase.from("campaigns").select("id, title, platforms, starts_at, ends_at").in("id", campaignIds) : { data: [], error: null },
    submissionIds.length ? supabase.from("submission_reviews").select("submission_id, decision, reason, created_at").in("submission_id", submissionIds).order("created_at", { ascending: false }) : { data: [], error: null },
  ]);
  const titleById = new Map((campaigns.data ?? []).map((item) => [item.id, item.title]));
  const platformsById = new Map((campaigns.data ?? []).map((item) => [item.id, item.platforms]));
  const campaignById = new Map((campaigns.data ?? []).map((item) => [item.id, item]));
  const latestReview = new Map<string, { decision: string; reason: string; created_at: string }>();
  for (const review of reviews.data ?? []) if (!latestReview.has(review.submission_id)) latestReview.set(review.submission_id, review);

  return (
    <div className="shell">
      <div className="page-heading"><div><p className="eyebrow">Clipper workspace</p><h1>My submissions</h1><p>Review decisions and correction notes are attached to each published post.</p></div><Link className="button button-secondary button-small" href="/campaigns">Find campaigns</Link></div>
      {query.submitted && <p className="form-message">Submission received. It is now waiting for admin review.</p>}
      {query.resubmitted && <p className="form-message">Your correction was resubmitted for review.</p>}
      {error && <div className="notice notice-error">Your submissions could not be loaded. Refresh and try again.</div>}
      {submissions?.length ? <div className="submission-list">{submissions.map((submission) => {
        const review = latestReview.get(submission.id);
        const canCorrect = submission.status === "changes_requested";
        const campaign = campaignById.get(submission.campaign_id);
        const today = istDate(new Date().toISOString());
        const maxDate = campaign?.ends_at && istDate(campaign.ends_at) < today ? istDate(campaign.ends_at) : today;
        return <article className="submission-card" key={submission.id}>
          <div className="submission-heading"><div><span className={`status-pill ${submission.status === "accepted" ? "active" : ""}`}>{statusLabel[submission.status] ?? submission.status}</span><h2>{titleById.get(submission.campaign_id) ?? "Campaign"}</h2><p>{submission.platform.replaceAll("_", " ")} · published {new Date(submission.published_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p></div><a className="button button-secondary button-small" href={submission.published_url} target="_blank" rel="noreferrer">Open post ↗</a></div>
          {submission.status === "accepted" && <p className="notice">This is an accepted submission review. This flow does not yet post an earning to your ledger or send money.</p>}
          {review?.reason && <div className={canCorrect ? "notice" : "review-note"}><strong>{review.decision.replaceAll("_", " ")}:</strong> {review.reason}</div>}
          {canCorrect && <details className="correction-editor"><summary>Make the requested correction</summary><p className="field-help">This updates the same submission and keeps its original campaign-terms snapshot.</p><ClipSubmissionForm submissionId={submission.id} availablePlatforms={platformsById.get(submission.campaign_id) ?? [submission.platform]} minDate={campaign?.starts_at ? istDate(campaign.starts_at) : undefined} maxDate={maxDate} initial={{ sourceUrl: submission.source_url, publishedUrl: submission.published_url, platform: submission.platform, publishedDate: istDate(submission.published_at), notes: submission.notes }} /></details>}
        </article>;
      })}</div> : !error ? <section className="content-panel empty-state"><h2>No submissions yet</h2><p>Join a published campaign, then submit the public link to your clip.</p><Link className="button" href="/campaigns">Find campaigns</Link></section> : null}
      {reviews.error && <p className="field-help">Review notes are temporarily unavailable; your submission statuses remain visible.</p>}
    </div>
  );
}
