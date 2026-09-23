import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ data: profile }, { data: roles }, { data: business }, { data: campaigns, error: campaignError }] = await Promise.all([
    supabase.from("profiles").select("full_name, preferred_language").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role, status").eq("user_id", user.id),
    supabase.from("businesses").select("id, company_name, status, decision_reason").eq("owner_id", user.id).maybeSingle(),
    supabase.from("campaigns").select("id, title, status, budget_paise, base_reward_paise, created_at").order("created_at", { ascending: false }).limit(8),
  ]);

  const requestedRole = roles?.find((item) => item.role === "business" || item.role === "clipper");
  const admin = roles?.some((item) => item.role === "admin" && item.status === "active");

  return (
    <div className="shell">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1>Welcome{profile?.full_name ? `, ${profile.full_name}` : " to Clipsetu"}</h1>
          <p>{user.email}</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="button button-secondary button-small" href="/onboarding">Complete profile</Link>
          {admin && <Link className="button button-secondary button-small" href="/admin">Admin review</Link>}
          <SignOutButton />
        </div>
      </div>

      {requestedRole?.status === "pending" && (
        <div className="notice">Your {requestedRole.role} access is pending review. You can complete your profile while we review the request.</div>
      )}
      {requestedRole?.status === "suspended" && (
        <div className="notice notice-error">This account is paused. Contact support if you believe this is a mistake.</div>
      )}
      {requestedRole?.status === "rejected" && (
        <div className="notice notice-error">Your access request was not approved. Contact support for the review reason.</div>
      )}

      <div className="grid-two">
        <section className="content-panel workflow-shortcuts" aria-label="Your workflows">
          <h2>Workflows</h2>
          <div className="actions">
            {requestedRole?.role === "business" && <Link className="button button-secondary button-small" href="/dashboard/campaigns">Manage campaigns</Link>}
            {requestedRole?.role === "clipper" && <><Link className="button button-secondary button-small" href="/campaigns">Discover campaigns</Link><Link className="button button-secondary button-small" href="/dashboard/submissions">My submissions</Link></>}
            {admin && <Link className="button button-secondary button-small" href="/admin">Review submissions</Link>}
          </div>
        </section>
        <section className="content-panel" aria-labelledby="campaign-title">
          <h2 id="campaign-title">Campaigns</h2>
          <p>Only persisted campaign records visible to your account are shown.</p>
          {campaignError ? <div className="notice notice-error">Campaigns could not be loaded. Refresh after checking your account setup.</div> : null}
          {campaigns?.length ? (
            <div className="data-list">
              {campaigns.map((campaign) => (
                <div className="data-row" key={campaign.id}>
                  <div>{campaign.title}<small>{campaign.status.replaceAll("_", " ")}</small></div>
                  <div className="amount">{inr.format(campaign.base_reward_paise / 100)}<small>per accepted clip · budget {inr.format(campaign.budget_paise / 100)}</small></div>
                </div>
              ))}
            </div>
          ) : !campaignError ? <p className="muted">No campaigns are visible yet. Published campaigns appear here when you’re eligible.</p> : null}
        </section>

        <aside className="content-panel">
          <h2>Account status</h2>
          <div className="status-row">
            {roles?.map((item) => <span className={`status-pill ${item.status === "active" ? "active" : ""}`} key={item.role}>{item.role}: {item.status}</span>)}
          </div>
          {business && <p className="muted">Business profile: {business.company_name} · {business.status}</p>}
          <p className="muted">Views are reported by clippers and reviewed by a human. This app does not automatically fetch social-platform views.</p>
          <div className="demo-banner">Demo records are separate. The old browser-only prototype remains at <Link href="/demo/index.html">/demo</Link> and must not contain real payment details.</div>
        </aside>
      </div>
    </div>
  );
}
