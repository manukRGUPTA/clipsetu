import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export default async function BusinessCampaignsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const [{ data: role }, { data: business }] = await Promise.all([
    supabase.from("user_roles").select("status").eq("user_id", user.id).eq("role", "business").maybeSingle(),
    supabase.from("businesses").select("id, company_name, status").eq("owner_id", user.id).maybeSingle(),
  ]);
  if (!role) redirect("/onboarding");
  const { data: campaigns, error } = business
    ? await supabase.from("campaigns").select("id, title, status, status_reason, budget_paise, base_reward_paise, join_mode, created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(50)
    : { data: [], error: null };

  return (
    <div className="shell">
      <div className="page-heading"><div><p className="eyebrow">Business workspace</p><h1>Your campaigns</h1><p>{business?.company_name ?? "Business profile not completed"} · budgets are plans, not funds held by Clipsetu.</p></div>{business?.status === "approved" && role.status === "active" && <Link className="button" href="/dashboard/campaigns/new">Create campaign</Link>}</div>
      {business?.status !== "approved" || role.status !== "active" ? <div className="notice">Campaign creation unlocks after both your business profile and business role are approved.</div> : null}
      {error && <div className="notice notice-error">Campaigns could not be loaded. Try again after refreshing your session.</div>}
      {campaigns?.length ? <div className="campaign-list">{campaigns.map((campaign) => (
        <article className="campaign-row" key={campaign.id}>
          <div><span className={`status-pill ${campaign.status === "published" ? "active" : ""}`}>{campaign.status.replaceAll("_", " ")}</span><h2><Link href={`/dashboard/campaigns/${campaign.id}`}>{campaign.title}</Link></h2><p>Base reward {inr.format(campaign.base_reward_paise / 100)} per accepted clip · budget plan {inr.format(campaign.budget_paise / 100)} · {campaign.join_mode === "open" ? "open joining" : "join requests"}</p>{campaign.status_reason && <p className="field-help">Review note: {campaign.status_reason}</p>}</div>
          <Link className="button button-secondary button-small" href={`/dashboard/campaigns/${campaign.id}`}>Manage</Link>
        </article>
      ))}</div> : !error ? <section className="content-panel empty-state"><h2>No campaigns yet</h2><p>Start with an authorized source, a clear clip brief, and INR reward terms.</p>{business?.status === "approved" && role.status === "active" && <Link href="/dashboard/campaigns/new" className="button">Create your first campaign</Link>}</section> : null}
      <p className="field-help"><Link href="/dashboard">Back to dashboard</Link></p>
    </div>
  );
}
