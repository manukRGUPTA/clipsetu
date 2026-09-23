import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinCampaignButton } from "@/components/campaign-actions";
import { createClient } from "@/lib/supabase/server";
import { currentTimeMillis } from "@/lib/campaigns/validation.mjs";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ q?: string; language?: string; platform?: string }> };
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function bonusText(value: import("@/lib/supabase/database.types").Json) {
  if (!Array.isArray(value)) return "";
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const rule = entry as Record<string, import("@/lib/supabase/database.types").Json | undefined>;
    return typeof rule.threshold_views === "number" && typeof rule.amount_paise === "number"
      ? [`₹${(rule.amount_paise / 100).toLocaleString("en-IN")} at ${rule.threshold_views.toLocaleString("en-IN")} verified cumulative views`]
      : [];
  }).join(" · ");
}

export default async function CampaignDiscoveryPage({ searchParams }: Props) {
  const filters = await searchParams;
  const query = (filters.q ?? "").trim().slice(0, 80);
  const language = (filters.language ?? "").trim().slice(0, 40);
  const platform = (filters.platform ?? "").trim().slice(0, 32);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: role } = await supabase.from("user_roles").select("status").eq("user_id", user.id).eq("role", "clipper").maybeSingle();
  if (!role || role.status !== "active") redirect("/onboarding");

  const { data: campaigns, error } = await supabase.from("campaigns")
    .select("id, business_id, title, description, languages, platforms, starts_at, ends_at, budget_paise, base_reward_paise, join_mode, bonus_rules, bonus_scope, bonus_stacking")
    .eq("status", "published").order("created_at", { ascending: false }).limit(100);
  const now = currentTimeMillis();
  const live = (campaigns ?? []).filter((campaign) => (!campaign.starts_at || Date.parse(campaign.starts_at) <= now) && (!campaign.ends_at || Date.parse(campaign.ends_at) >= now))
    .filter((campaign) => !query || `${campaign.title} ${campaign.description}`.toLocaleLowerCase("en-IN").includes(query.toLocaleLowerCase("en-IN")))
    .filter((campaign) => !language || campaign.languages.some((item) => item.toLocaleLowerCase("en-IN").includes(language.toLocaleLowerCase("en-IN"))))
    .filter((campaign) => !platform || campaign.platforms.includes(platform));
  const campaignIds = live.map((campaign) => campaign.id);
  const businessIds = [...new Set(live.map((campaign) => campaign.business_id))];
  const [participants, businesses] = campaignIds.length ? await Promise.all([
    supabase.from("campaign_participants").select("campaign_id, status").eq("clipper_id", user.id).in("campaign_id", campaignIds),
    supabase.from("published_campaign_business_directory").select("id, company_name").in("id", businessIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const participantStatus = new Map((participants.data ?? []).map((item) => [item.campaign_id, item.status]));
  const businessName = new Map((businesses.data ?? []).map((item) => [item.id, item.company_name]));

  return (
    <div className="shell">
      <div className="page-heading"><div><p className="eyebrow">Clipper workspace</p><h1>Find a campaign</h1><p>Review the brief before joining. Campaign budget is a stated cap, not a deposit or guaranteed payout.</p></div><Link className="button button-secondary button-small" href="/dashboard">Dashboard</Link></div>
      <form className="filter-bar" method="get">
        <div className="field"><label htmlFor="q">Search campaigns</label><input id="q" name="q" maxLength={80} defaultValue={query} placeholder="Campaign, brand, topic" /></div>
        <div className="field"><label htmlFor="language">Language</label><input id="language" name="language" maxLength={40} defaultValue={language} placeholder="Hindi, Bhojpuri…" /></div>
        <div className="field"><label htmlFor="platform">Platform</label><select id="platform" name="platform" defaultValue={platform}><option value="">Any platform</option><option value="instagram_reels">Instagram Reels</option><option value="youtube_shorts">YouTube Shorts</option><option value="tiktok">TikTok</option><option value="other">Other</option></select></div>
        <button className="button button-small">Apply filters</button>
      </form>
      {error && <div className="notice notice-error">Campaign discovery is temporarily unavailable. Refresh after checking your connection.</div>}
      {live.length ? <div className="campaign-grid">{live.map((campaign) => {
        const status = participantStatus.get(campaign.id);
        return <article className="campaign-card" key={campaign.id}>
          <p className="eyebrow">{businessName.get(campaign.business_id) ?? "Business"}</p>
          <h2><Link href={`/campaigns/${campaign.id}`}>{campaign.title}</Link></h2>
          <p className="campaign-description">{campaign.description || "Open the campaign brief for publishing rules and clip requirements."}</p>
          <div className="campaign-facts"><span>₹{(campaign.base_reward_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: campaign.base_reward_paise % 100 ? 2 : 0 })} / accepted clip</span><span>{campaign.platforms.map((item) => item.replaceAll("_", " ")).join(" · ")}</span><span>{campaign.languages.join(" · ")}</span></div>
          {bonusText(campaign.bonus_rules) && <p className="campaign-bonus">Bonus: {bonusText(campaign.bonus_rules)} · {campaign.bonus_scope?.replaceAll("_", " ")} · {campaign.bonus_stacking?.replaceAll("_", " ")}</p>}
          <p className="campaign-budget">Budget plan: {inr.format(campaign.budget_paise / 100)} · not held by Clipsetu</p>
          {status === "active" ? <div className="actions"><span className="status-pill active">Joined</span><Link href={`/campaigns/${campaign.id}`} className="button button-secondary button-small">Open brief</Link></div>
            : status === "requested" ? <p className="status-pill">Join request pending</p>
              : status === "declined" ? <p className="status-pill">Request declined</p>
                : <JoinCampaignButton campaignId={campaign.id} mode={campaign.join_mode} />}
        </article>;
      })}</div> : !error ? <section className="content-panel empty-state"><h2>No matching campaigns</h2><p>Try clearing one of the filters. Only currently open, admin-published campaigns appear here.</p><Link className="button button-secondary button-small" href="/campaigns">Clear filters</Link></section> : null}
      {participants.error || businesses.error ? <p className="field-help">Some campaign participation details could not be loaded.</p> : null}
    </div>
  );
}
