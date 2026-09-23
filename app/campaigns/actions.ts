"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dateToIstNoonIso, safeHttpsUrl, urlMatchesPlatform } from "@/lib/campaigns/validation.mjs";
import type { CampaignActionState } from "@/app/dashboard/campaigns/actions";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const platforms = ["instagram_reels", "youtube_shorts", "tiktok", "other"] as const;

function field(formData: FormData, name: string, _maxLength?: number) {
  void _maxLength;
  return String(formData.get(name) ?? "").trim();
}

type ValidSubmission = { sourceUrl: string; publishedUrl: string; platform: (typeof platforms)[number]; publishedAt: string; notes: string };
function validateSubmission(formData: FormData): { error: string } | ValidSubmission {
  const sourceUrl = safeHttpsUrl(field(formData, "source_url", 2048));
  const publishedUrl = safeHttpsUrl(field(formData, "published_url", 2048));
  const platform = field(formData, "platform", 32);
  const publishedAt = dateToIstNoonIso(field(formData, "published_date", 10));
  const notes = field(formData, "notes", 2000);
  if (!sourceUrl || !publishedUrl) return { error: "Add valid public HTTPS links for both the source and published clip." };
  if (notes.length > 2000) return { error: "Reviewer notes must be no more than 2,000 characters." };
  if (!platforms.includes(platform as (typeof platforms)[number])) return { error: "Choose the platform where the clip was published." };
  if (!urlMatchesPlatform(publishedUrl, platform)) return { error: "The published post link does not match the selected platform." };
  if (!publishedAt) return { error: "Enter a valid publication date." };
  return { sourceUrl, publishedUrl, platform: platform as (typeof platforms)[number], publishedAt, notes };
}

export async function joinCampaign(_state: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const campaignId = field(formData, "campaign_id", 40);
  if (!uuidPattern.test(campaignId)) return { error: "This campaign link is invalid. Refresh and try again." };
  const supabase = await createClient();
  const { data: status, error } = await supabase.rpc("join_campaign", { p_campaign_id: campaignId });
  if (error || !status) return { error: error?.message ?? "Could not join this campaign." };
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/dashboard");
  redirect(`/campaigns/${campaignId}?join=${status}`);
}

export async function decideParticipation(_state: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const campaignId = field(formData, "campaign_id", 40);
  const clipperId = field(formData, "clipper_id", 40);
  const decision = field(formData, "decision", 16);
  const reason = field(formData, "reason", 1000);
  if (!uuidPattern.test(campaignId) || !uuidPattern.test(clipperId) || !["active", "declined"].includes(decision)) return { error: "This participation decision is invalid." };
  if (decision === "declined" && !reason) return { error: "Add a brief reason before declining." };
  if (reason.length > 1000) return { error: "The decision reason must be no more than 1,000 characters." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("business_decide_participation", {
    p_campaign_id: campaignId,
    p_clipper_id: clipperId,
    p_decision: decision as "active" | "declined",
    p_reason: reason || null,
  });
  if (error) return { error: error.message.length <= 240 ? error.message : "The participation decision could not be saved." };
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  redirect(`/dashboard/campaigns/${campaignId}?participant=${decision}`);
}

export async function submitClip(_state: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const campaignId = field(formData, "campaign_id", 40);
  if (!uuidPattern.test(campaignId)) return { error: "This campaign link is invalid. Refresh and try again." };
  const parsed = validateSubmission(formData);
  if ("error" in parsed) return parsed;
  const supabase = await createClient();
  const { data: submissionId, error } = await supabase.rpc("submit_clip", {
    p_campaign_id: campaignId,
    p_source_url: parsed.sourceUrl,
    p_published_url: parsed.publishedUrl,
    p_platform: parsed.platform,
    p_published_at: parsed.publishedAt,
    p_notes: parsed.notes,
  });
  if (error) {
    if (error.code === "23505") return { error: "That published post link has already been submitted. Each post can only be entered once." };
    return { error: error.message.length <= 240 ? error.message : "Your submission could not be saved. Check the links and campaign dates." };
  }
  revalidatePath("/dashboard/submissions");
  revalidatePath("/admin");
  redirect(`/dashboard/submissions?submitted=${submissionId}`);
}

export async function resubmitClip(_state: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const submissionId = field(formData, "submission_id", 40);
  if (!uuidPattern.test(submissionId)) return { error: "This submission link is invalid. Refresh and try again." };
  const parsed = validateSubmission(formData);
  if ("error" in parsed) return parsed;
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_clip", {
    p_submission_id: submissionId,
    p_source_url: parsed.sourceUrl,
    p_published_url: parsed.publishedUrl,
    p_platform: parsed.platform,
    p_published_at: parsed.publishedAt,
    p_notes: parsed.notes,
  });
  if (error) {
    if (error.code === "23505") return { error: "That published post link has already been submitted. Each post can only be entered once." };
    return { error: error.message.length <= 240 ? error.message : "Your correction could not be saved." };
  }
  revalidatePath("/dashboard/submissions");
  revalidatePath("/admin");
  redirect("/dashboard/submissions?resubmitted=1");
}
