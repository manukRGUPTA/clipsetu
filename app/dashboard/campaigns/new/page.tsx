import Link from "next/link";
import { redirect } from "next/navigation";
import { CampaignForm } from "@/components/campaign-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const [{ data: role }, { data: business }] = await Promise.all([
    supabase.from("user_roles").select("status").eq("user_id", user.id).eq("role", "business").maybeSingle(),
    supabase.from("businesses").select("id, status").eq("owner_id", user.id).maybeSingle(),
  ]);
  if (!role || !business || role.status !== "active" || business.status !== "approved") redirect("/dashboard/campaigns");

  return <div className="shell"><div className="page-heading"><div><p className="eyebrow">Business workspace</p><h1>Build a campaign brief</h1><p>Save a draft first, then submit it for admin review when the terms are complete.</p></div><Link className="button button-secondary button-small" href="/dashboard/campaigns">All campaigns</Link></div><CampaignForm businessId={business.id} /></div>;
}
