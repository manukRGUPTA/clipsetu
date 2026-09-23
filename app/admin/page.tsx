import { redirect } from "next/navigation";
import { AdminMfa } from "@/components/admin-mfa";
import { createClient } from "@/lib/supabase/server";
import { reviewBusiness, reviewCampaign, reviewRoleRequest } from "./actions";

export const dynamic = "force-dynamic";

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

  const [{ data: businesses, error: businessError }, { data: campaigns, error: campaignError }, { data: pendingRoles, error: rolesError }] = await Promise.all([
    supabase.from("businesses").select("id, company_name, owner_id, contact_email, status, created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(50),
    supabase.from("campaigns").select("id, title, business_id, status, source_url, source_rights_confirmed, base_reward_paise, budget_paise, created_at").eq("status", "pending_approval").order("created_at", { ascending: true }).limit(50),
    supabase.from("user_roles").select("user_id, role, status, created_at").eq("status", "pending").eq("role", "clipper").order("created_at", { ascending: true }).limit(50),
  ]);
  const pendingProfiles = pendingRoles?.length
    ? await supabase.from("profiles").select("id, full_name").in("id", pendingRoles.map((item) => item.user_id))
    : { data: [], error: null };

  return (
    <div className="shell">
      <div className="page-heading"><div><p className="eyebrow">Restricted operations</p><h1>Admin review</h1><p>Every decision is recorded. Role, review, and payment status changes run through database functions.</p></div></div>
      {businessError || campaignError || rolesError || pendingProfiles.error ? <div className="notice notice-error">The review queue could not be loaded. Confirm this account has admin MFA and project policies are applied.</div> : null}
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
              <p className="field-help">Rights confirmed: {campaign.source_rights_confirmed ? "Yes" : "No"}. Budget is not escrow.</p>
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
      </div>
    </div>
  );
}
