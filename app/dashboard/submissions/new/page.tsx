import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipSubmissionForm } from "@/components/campaign-actions";
import { createClient } from "@/lib/supabase/server";
import { currentTimeMillis } from "@/lib/campaigns/validation.mjs";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ campaign_id?: string }> };

function istDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export default async function NewSubmissionPage({ searchParams }: Props) {
  const { campaign_id: campaignId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: role } = await supabase.from("user_roles").select("status").eq("user_id", user.id).eq("role", "clipper").maybeSingle();
  if (!role || role.status !== "active") redirect("/onboarding");
  if (!campaignId || campaignId.length > 40) redirect("/campaigns");

  const [{ data: campaign }, { data: participation }] = await Promise.all([
    supabase.from("campaigns").select("id, title, source_url, platforms, starts_at, ends_at, status").eq("id", campaignId).eq("status", "published").maybeSingle(),
    supabase.from("campaign_participants").select("status").eq("campaign_id", campaignId).eq("clipper_id", user.id).maybeSingle(),
  ]);
  if (!campaign || participation?.status !== "active") redirect(`/campaigns/${campaignId}`);
  const now = currentTimeMillis();
  if ((campaign.starts_at && Date.parse(campaign.starts_at) > now) || (campaign.ends_at && Date.parse(campaign.ends_at) < now)) redirect(`/campaigns/${campaign.id}`);
  const today = istDate(new Date().toISOString());
  const latestAllowed = campaign.ends_at && istDate(campaign.ends_at) < today ? istDate(campaign.ends_at) : today;
  const earliestAllowed = campaign.starts_at ? istDate(campaign.starts_at) : undefined;

  return <div className="shell narrow-shell"><div className="page-heading"><div><p className="eyebrow">Campaign submission</p><h1>{campaign.title}</h1><p>Submit a public post link for human review.</p></div><Link className="button button-secondary button-small" href={`/campaigns/${campaign.id}`}>Campaign brief</Link></div><section className="content-panel"><ClipSubmissionForm campaignId={campaign.id} availablePlatforms={campaign.platforms} minDate={earliestAllowed} maxDate={latestAllowed} initial={{ sourceUrl: campaign.source_url ?? "" }} /></section></div>;
}
