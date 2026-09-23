import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JoinCampaignButton } from "@/components/campaign-actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { currentTimeMillis } from "@/lib/campaigns/validation.mjs";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ join?: string }> };
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function object(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json | undefined> : {};
}

export default async function CampaignBriefPage({ params, searchParams }: Props) {
  const { id } = await params;
  const search = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: role } = await supabase.from("user_roles").select("status").eq("user_id", user.id).eq("role", "clipper").maybeSingle();
  if (!role || role.status !== "active") redirect("/onboarding");

  const { data: campaign, error } = await supabase.from("campaigns").select("*").eq("id", id).eq("status", "published").maybeSingle();
  if (error || !campaign) notFound();
  const [{ data: termsRows }, { data: participant }, { data: business }] = await Promise.all([
    supabase.from("campaign_terms").select("version, terms").eq("campaign_id", campaign.id).order("version", { ascending: false }).limit(1),
    supabase.from("campaign_participants").select("status, decision_reason").eq("campaign_id", campaign.id).eq("clipper_id", user.id).maybeSingle(),
    supabase.from("published_campaign_business_directory").select("company_name").eq("id", campaign.business_id).maybeSingle(),
  ]);
  const terms = object(termsRows?.[0]?.terms);
  const now = currentTimeMillis();
  const startsLater = campaign.starts_at && Date.parse(campaign.starts_at) > now;
  const ended = campaign.ends_at && Date.parse(campaign.ends_at) < now;

  return (
    <div className="shell">
      <div className="page-heading"><div><p className="eyebrow">{business?.company_name ?? "Campaign brief"}</p><h1>{campaign.title}</h1><p>Terms version {termsRows?.[0]?.version ?? "—"} · {campaign.join_mode === "open" ? "open joining" : "business approval required"}</p></div><Link className="button button-secondary button-small" href="/campaigns">Campaign discovery</Link></div>
      {search.join === "active" && <p className="form-message">You joined. Your submissions will use the current campaign terms snapshot.</p>}
      {search.join === "requested" && <p className="form-message">Your request was sent to the business. You can submit after it is approved.</p>}
      <section className="content-panel brief-layout">
        <div><h2>About this campaign</h2><p>{campaign.description || "No additional campaign description."}</p><dl className="terms-list"><div><dt>Clip requirements</dt><dd>{String(terms.clip_requirements ?? "Not specified")}</dd></div><div><dt>Content guidelines</dt><dd>{String(terms.content_guidelines ?? "Not specified")}</dd></div><div><dt>Disclosure</dt><dd>{String(terms.disclosure ?? "No special guidance")}</dd></div></dl></div>
        <aside className="brief-summary"><div className="panel-label">Reward terms</div><p className="reward-amount">{inr.format(campaign.base_reward_paise / 100)}<small> per accepted clip</small></p><p>Campaign budget plan: {inr.format(campaign.budget_paise / 100)}. This is not escrow or a guaranteed payout.</p><p>Platforms: {campaign.platforms.map((item) => item.replaceAll("_", " ")).join(", ") || "Not set"}</p><p>Languages: {campaign.languages.join(", ") || "Not set"}</p>{Array.isArray(campaign.bonus_rules) && campaign.bonus_rules.map((entry, index) => { if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null; const rule = entry as Record<string, Json | undefined>; return typeof rule.threshold_views === "number" && typeof rule.amount_paise === "number" ? <p key={index}>Bonus: {inr.format(rule.amount_paise / 100)} at {rule.threshold_views.toLocaleString("en-IN")} verified cumulative views · {campaign.bonus_scope?.replaceAll("_", " ")} · {campaign.bonus_stacking?.replaceAll("_", " ")}</p> : null; })}{campaign.source_url && <p><a href={campaign.source_url} target="_blank" rel="noreferrer">Open authorized source ↗</a></p>}
          {participant?.status === "active" ? <div className="actions"><span className="status-pill active">You’re participating</span>{!startsLater && !ended && <Link className="button" href={`/dashboard/submissions/new?campaign_id=${campaign.id}`}>Submit a published clip</Link>}</div>
            : participant?.status === "requested" ? <p className="status-pill">Join request pending</p>
              : participant?.status === "declined" ? <p className="notice">Join request declined{participant.decision_reason ? `: ${participant.decision_reason}` : "."}</p>
                : startsLater ? <p className="notice">Joining opens {new Date(campaign.starts_at!).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.</p>
                  : ended ? <p className="notice">This campaign has ended.</p>
                    : <JoinCampaignButton campaignId={campaign.id} mode={campaign.join_mode} />}
        </aside>
      </section>
      <p className="field-help">View counts are submitted separately and verified by a human. Clipsetu does not fetch views from social platforms.</p>
    </div>
  );
}
