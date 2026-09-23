"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseCommaList, rupeesToPaise, safeHttpsUrl, istDateTimeToIso } from "@/lib/campaigns/validation.mjs";

export type CampaignActionState = { error: string };

const platforms = ["instagram_reels", "youtube_shorts", "tiktok", "other"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimField(formData: FormData, name: string, _maxLength?: number) {
  void _maxLength;
  return String(formData.get(name) ?? "").trim();
}

function parseMilestone(formData: FormData): { rules: { threshold_views: number; amount_paise: number }[]; scope: string | null; stacking: string | null } | string {
  const thresholds = formData.getAll("bonus_threshold_views").map((value) => String(value).trim());
  const amounts = formData.getAll("bonus_amount_rupees").map((value) => String(value).trim());
  const scope = trimField(formData, "bonus_scope", 32);
  const stacking = trimField(formData, "bonus_stacking", 32);
  if (thresholds.length !== amounts.length || thresholds.length > 10) return "A campaign can have up to 10 complete view milestones.";
  const rules: { threshold_views: number; amount_paise: number }[] = [];
  for (let i = 0; i < thresholds.length; i += 1) {
    const threshold = thresholds[i];
    const amount = amounts[i];
    if (!threshold && !amount) continue;
    if (!threshold || !/^\d{1,12}$/.test(threshold) || Number(threshold) < 1 || !amount) return "Each view bonus needs a positive whole-number threshold and INR amount.";
    const amountPaise = rupeesToPaise(amount);
    if (!amountPaise || amountPaise < 1 || amountPaise > 999999999999) return "Enter a valid positive bonus amount in INR.";
    rules.push({ threshold_views: Number(threshold), amount_paise: amountPaise });
  }
  if (new Set(rules.map((rule) => rule.threshold_views)).size !== rules.length) return "View bonus thresholds must be unique.";
  if (!rules.length) return { rules: [], scope: null, stacking: null };
  if (!["per_clip", "per_clipper", "per_campaign"].includes(scope)) return "Choose whether the bonus applies per clip, per clipper, or to the campaign.";
  if (!["cumulative", "highest_only"].includes(stacking)) return "Choose whether view milestones stack or only the highest one applies.";
  return { rules, scope, stacking };
}

export async function saveCampaignDraft(_state: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const campaignId = trimField(formData, "campaign_id", 40) || null;
  const businessId = trimField(formData, "business_id", 40);
  if (!uuidPattern.test(businessId) || (campaignId && !uuidPattern.test(campaignId))) return { error: "This campaign link is invalid. Refresh and try again." };

  const title = trimField(formData, "title", 180);
  if (title.length < 3 || title.length > 180) return { error: "Campaign title must be 3–180 characters." };
  const description = trimField(formData, "description", 4000);
  if (description.length > 4000) return { error: "Campaign description must be no more than 4,000 characters." };
  const rawSource = trimField(formData, "source_url", 2048);
  const sourceUrl = rawSource ? safeHttpsUrl(rawSource) : null;
  if (rawSource && !sourceUrl) return { error: "Use a public HTTPS link for the original content." };

  const languages = parseCommaList(formData.get("languages"), 12);
  if (!languages) return { error: "Use at most 12 languages, separated by commas." };
  if (languages.some((language) => language.length < 2 || language.length > 40)) return { error: "Each language name must be 2–40 characters." };
  const selectedPlatforms = formData.getAll("platforms").map(String);
  if (selectedPlatforms.some((platform) => !platforms.includes(platform as (typeof platforms)[number]))) return { error: "Choose only supported publishing platforms." };
  const uniquePlatforms = [...new Set(selectedPlatforms)];

  const budgetPaise = trimField(formData, "budget_rupees", 32) ? rupeesToPaise(formData.get("budget_rupees")) : 0;
  const baseRewardPaise = trimField(formData, "base_reward_rupees", 32) ? rupeesToPaise(formData.get("base_reward_rupees")) : 0;
  if (budgetPaise === null || baseRewardPaise === null) return { error: "Enter INR amounts with up to two decimal places." };
  if (baseRewardPaise > budgetPaise) return { error: "Per-clip reward cannot be higher than the stated campaign budget." };

  const bonus = parseMilestone(formData);
  if (typeof bonus === "string") return { error: bonus };
  const startsText = trimField(formData, "starts_at", 32);
  const endsText = trimField(formData, "ends_at", 32);
  const startsAt = startsText ? istDateTimeToIso(startsText) : null;
  const endsAt = endsText ? istDateTimeToIso(endsText) : null;
  if ((startsText && !startsAt) || (endsText && !endsAt)) return { error: "Enter valid dates and times in IST." };
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return { error: "Campaign end must be after its start." };

  const joinMode = trimField(formData, "join_mode", 20);
  if (joinMode !== "open" && joinMode !== "approval") return { error: "Choose how clippers can join." };
  const terms = {
    clip_requirements: trimField(formData, "clip_requirements", 4000),
    content_guidelines: trimField(formData, "content_guidelines", 4000),
    disclosure: trimField(formData, "disclosure", 1000),
  };
  if (terms.disclosure.length > 1000) return { error: "Disclosure guidance must be no more than 1,000 characters." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session ended. Sign in and try again." };

  const { data: savedId, error } = await supabase.rpc("save_campaign_draft", {
    p_campaign_id: campaignId,
    p_business_id: businessId,
    p_title: title,
    p_description: description,
    p_source_url: sourceUrl,
    p_source_rights_confirmed: formData.get("source_rights_confirmed") === "on",
    p_languages: languages,
    p_platforms: uniquePlatforms,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_budget_paise: budgetPaise,
    p_base_reward_paise: baseRewardPaise,
    p_join_mode: joinMode,
    p_bonus_rules: bonus.rules,
    p_bonus_scope: bonus.scope,
    p_bonus_stacking: bonus.stacking,
    p_terms: terms,
  });
  if (error || !savedId) {
    const safeMessage = error?.message ?? "The draft could not be saved.";
    return { error: safeMessage.length <= 240 ? safeMessage : "The draft could not be saved. Check the campaign fields and try again." };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/campaigns");
  redirect(`/dashboard/campaigns/${savedId}?saved=1`);
}

export async function requestCampaignReview(_state: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const campaignId = trimField(formData, "campaign_id", 40);
  if (!uuidPattern.test(campaignId)) return { error: "This campaign link is invalid. Refresh and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_campaign_review", { p_campaign_id: campaignId });
  if (error) return { error: error.message.length <= 240 ? error.message : "The campaign could not be submitted for review." };
  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  revalidatePath("/admin");
  redirect(`/dashboard/campaigns/${campaignId}?submitted=1`);
}
