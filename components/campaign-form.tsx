"use client";

import { useActionState, useState } from "react";
import type { Json } from "@/lib/supabase/database.types";
import { requestCampaignReview, saveCampaignDraft } from "@/app/dashboard/campaigns/actions";

type CampaignValues = {
  id: string;
  business_id: string;
  title: string;
  description: string;
  source_url: string | null;
  source_rights_confirmed: boolean;
  languages: string[];
  platforms: string[];
  starts_at: string | null;
  ends_at: string | null;
  budget_paise: number;
  base_reward_paise: number;
  join_mode: "open" | "approval";
  bonus_rules: Json;
  bonus_scope: string | null;
  bonus_stacking: string | null;
  status: string;
} | null;

type Props = { businessId: string; campaign?: CampaignValues; terms?: Json | null };
const labels: Record<string, string> = {
  instagram_reels: "Instagram Reels",
  youtube_shorts: "YouTube Shorts",
  tiktok: "TikTok",
  other: "Other supported platform",
};

function amount(paise: number | undefined) {
  return paise && paise > 0 ? (paise / 100).toFixed(2) : "";
}

function istInput(value: string | null | undefined) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const result = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${result.year}-${result.month}-${result.day}T${result.hour}:${result.minute}`;
}

function termValue(terms: Json | null | undefined, key: string) {
  if (!terms || typeof terms !== "object" || Array.isArray(terms)) return "";
  const value = (terms as Record<string, Json | undefined>)[key];
  return typeof value === "string" ? value : "";
}

function initialMilestones(rules: Json | undefined) {
  if (!Array.isArray(rules)) return [];
  return rules.flatMap((rule) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return [];
    const row = rule as Record<string, Json | undefined>;
    const threshold = row.threshold_views;
    const amountPaise = row.amount_paise;
    if (typeof threshold !== "number" || typeof amountPaise !== "number") return [];
    return [{ threshold: String(threshold), amount: amount(amountPaise) }];
  });
}

export function CampaignForm({ businessId, campaign = null, terms = null }: Props) {
  const [state, action, pending] = useActionState(saveCampaignDraft, { error: "" });
  const [milestones, setMilestones] = useState(() => initialMilestones(campaign?.bonus_rules));
  const editable = !campaign || ["draft", "changes_requested"].includes(campaign.status);
  const titleId = campaign?.id ?? "new";

  if (!editable) return <div className="notice">This campaign is already in review or published and can no longer be edited from this form.</div>;

  return (
    <form action={action} className="workflow-form">
      <input type="hidden" name="business_id" value={businessId} />
      {campaign?.id && <input type="hidden" name="campaign_id" value={campaign.id} />}
      <section className="form-section">
        <h2>Campaign overview</h2>
        <div className="field"><label htmlFor={`title-${titleId}`}>Campaign name</label><input id={`title-${titleId}`} name="title" required minLength={3} maxLength={180} defaultValue={campaign?.title ?? ""} placeholder="e.g. Short clips from our founder podcast" /></div>
        <div className="field"><label htmlFor={`description-${titleId}`}>What is the campaign about?</label><textarea id={`description-${titleId}`} name="description" maxLength={4000} rows={3} defaultValue={campaign?.description ?? ""} placeholder="Give clippers context about the brand, show, or product." /></div>
        <div className="field"><label htmlFor={`source-${titleId}`}>Authorized original content link</label><input id={`source-${titleId}`} name="source_url" type="url" maxLength={2048} defaultValue={campaign?.source_url ?? ""} placeholder="https://…" /><span className="field-help">Use a public HTTPS link you are authorized to let clippers edit.</span></div>
        <label className="check-row"><input type="checkbox" name="source_rights_confirmed" defaultChecked={campaign?.source_rights_confirmed ?? false} /> I have permission to use this source and allow the campaign clipping described here.</label>
      </section>

      <section className="form-section">
        <h2>Clipper brief</h2>
        <div className="field"><label htmlFor={`requirements-${titleId}`}>What must each clip include?</label><textarea id={`requirements-${titleId}`} name="clip_requirements" maxLength={4000} rows={4} defaultValue={termValue(terms, "clip_requirements")} placeholder="Length, framing, hook, subtitles, and deliverable expectations." /><span className="field-help">At least 12 characters are required before review.</span></div>
        <div className="field"><label htmlFor={`guidelines-${titleId}`}>Content guidelines and restrictions</label><textarea id={`guidelines-${titleId}`} name="content_guidelines" maxLength={4000} rows={4} defaultValue={termValue(terms, "content_guidelines")} placeholder="What to avoid, brand safety, edits that are not allowed, and claim restrictions." /><span className="field-help">At least 12 characters are required before review.</span></div>
        <div className="field"><label htmlFor={`disclosure-${titleId}`}>Disclosure guidance (optional)</label><textarea id={`disclosure-${titleId}`} name="disclosure" maxLength={1000} rows={2} defaultValue={termValue(terms, "disclosure")} placeholder="For example, any required partnership label or caption disclosure." /></div>
        <div className="field"><span className="field-label">Where may clippers publish?</span><div className="choice-grid">{Object.entries(labels).map(([value, label]) => <label className="check-row" key={value}><input type="checkbox" name="platforms" value={value} defaultChecked={campaign?.platforms.includes(value) ?? false} /> {label}</label>)}</div></div>
        <div className="field"><label htmlFor={`languages-${titleId}`}>Languages</label><input id={`languages-${titleId}`} name="languages" maxLength={500} defaultValue={campaign?.languages.join(", ") ?? ""} placeholder="Hindi, English, Bhojpuri" /><span className="field-help">Separate with commas; add up to 12 languages.</span></div>
      </section>

      <section className="form-section">
        <h2>Rewards and timing</h2>
        <div className="form-grid">
          <div className="field"><label htmlFor={`base-${titleId}`}>Reward per accepted clip (₹)</label><input id={`base-${titleId}`} name="base_reward_rupees" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={amount(campaign?.base_reward_paise)} placeholder="40" /><span className="field-help">Stored as integer paise; approval does not mean payment has happened.</span></div>
          <div className="field"><label htmlFor={`budget-${titleId}`}>Campaign budget plan (₹)</label><input id={`budget-${titleId}`} name="budget_rupees" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={amount(campaign?.budget_paise)} placeholder="25000" /><span className="field-help">This is a stated cap, not an escrow or deposit.</span></div>
          <div className="field"><label htmlFor={`starts-${titleId}`}>Starts at (IST, optional)</label><input id={`starts-${titleId}`} name="starts_at" type="datetime-local" defaultValue={istInput(campaign?.starts_at)} /></div>
          <div className="field"><label htmlFor={`ends-${titleId}`}>Ends at (IST, optional)</label><input id={`ends-${titleId}`} name="ends_at" type="datetime-local" defaultValue={istInput(campaign?.ends_at)} /></div>
          <div className="field full"><label htmlFor={`join-${titleId}`}>How clippers join</label><select id={`join-${titleId}`} name="join_mode" defaultValue={campaign?.join_mode ?? "approval"}><option value="approval">Request to join — business approves</option><option value="open">Open — eligible clippers join immediately</option></select></div>
        </div>
        <section className="bonus-editor" aria-labelledby={`bonus-heading-${titleId}`}>
          <h3 id={`bonus-heading-${titleId}`}>Optional view milestone bonuses</h3>
          <p className="field-help">Views are self-reported and reviewed by an admin; they are not fetched automatically.</p>
          {milestones.map((milestone, index) => <div className="milestone-row" key={index}>
            <div className="field"><label htmlFor={`threshold-${titleId}-${index}`}>Cumulative views reached</label><input id={`threshold-${titleId}-${index}`} name="bonus_threshold_views" inputMode="numeric" pattern="[0-9]*" value={milestone.threshold} onChange={(event) => setMilestones((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, threshold: event.target.value } : item))} placeholder="1000000" /></div>
            <div className="field"><label htmlFor={`bonus-${titleId}-${index}`}>Bonus amount (₹)</label><input id={`bonus-${titleId}-${index}`} name="bonus_amount_rupees" type="number" inputMode="decimal" min="0" step="0.01" value={milestone.amount} onChange={(event) => setMilestones((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} placeholder="150" /></div>
            <button type="button" className="button button-secondary button-small remove-milestone" aria-label={`Remove milestone ${index + 1}`} onClick={() => setMilestones((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
          </div>)}
          <button type="button" className="button button-secondary button-small" disabled={milestones.length >= 10} onClick={() => setMilestones((items) => [...items, { threshold: "", amount: "" }])}>{milestones.length >= 10 ? "Maximum reached" : "Add view milestone"}</button>
          <div className="form-grid">
            <div className="field"><label htmlFor={`scope-${titleId}`}>Bonus scope</label><select id={`scope-${titleId}`} name="bonus_scope" defaultValue={campaign?.bonus_scope ?? ""}><option value="">Choose if adding a milestone</option><option value="per_clip">Per clip</option><option value="per_clipper">Per clipper</option><option value="per_campaign">Campaign total</option></select></div>
            <div className="field"><label htmlFor={`stacking-${titleId}`}>If multiple milestones are reached</label><select id={`stacking-${titleId}`} name="bonus_stacking" defaultValue={campaign?.bonus_stacking ?? ""}><option value="">Choose if adding a milestone</option><option value="cumulative">Stack all reached milestones</option><option value="highest_only">Pay only the highest milestone</option></select></div>
          </div>
        </section>
      </section>

      {state.error && <p className="form-message error" role="alert">{state.error}</p>}
      <div className="actions"><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save campaign draft"}</button></div>
    </form>
  );
}

export function RequestCampaignReviewForm({ campaignId }: { campaignId: string }) {
  const [state, action, pending] = useActionState(requestCampaignReview, { error: "" });
  return <form action={action} className="inline-review-form"><input type="hidden" name="campaign_id" value={campaignId} /><button className="button" disabled={pending}>{pending ? "Sending…" : "Send for admin review"}</button>{state.error && <p className="form-message error" role="alert">{state.error}</p>}</form>;
}
