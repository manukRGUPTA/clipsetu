"use client";

import { useActionState } from "react";
import { decideParticipation, joinCampaign, resubmitClip, submitClip } from "@/app/campaigns/actions";

const platformLabels: Record<string, string> = {
  instagram_reels: "Instagram Reels",
  youtube_shorts: "YouTube Shorts",
  tiktok: "TikTok",
  other: "Other supported platform",
};

export function JoinCampaignButton({ campaignId, mode }: { campaignId: string; mode: "open" | "approval" }) {
  const [state, action, pending] = useActionState(joinCampaign, { error: "" });
  return <form action={action} className="join-form"><input type="hidden" name="campaign_id" value={campaignId} /><button className="button" disabled={pending}>{pending ? "Joining…" : mode === "open" ? "Join campaign" : "Request to join"}</button>{state.error && <p role="alert" className="form-message error">{state.error}</p>}</form>;
}

export function ParticipationDecisionForm({ campaignId, clipperId, clipperName }: { campaignId: string; clipperId: string; clipperName: string }) {
  const [state, action, pending] = useActionState(decideParticipation, { error: "" });
  return (
    <form action={action} className="decision-form">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <input type="hidden" name="clipper_id" value={clipperId} />
      <label className="sr-only" htmlFor={`participation-reason-${clipperId}`}>Reason if declining {clipperName}</label>
      <input id={`participation-reason-${clipperId}`} name="reason" maxLength={1000} placeholder="Reason required to decline" />
      <button className="button button-small" name="decision" value="active" disabled={pending}>Approve</button>
      <button className="button button-secondary button-small" name="decision" value="declined" disabled={pending}>Decline</button>
      {state.error && <p role="alert" className="form-message error">{state.error}</p>}
    </form>
  );
}

export type SubmissionValues = {
  sourceUrl?: string;
  publishedUrl?: string;
  platform?: string;
  publishedDate?: string;
  notes?: string;
};

export function ClipSubmissionForm({
  campaignId,
  submissionId,
  availablePlatforms,
  minDate,
  maxDate,
  initial,
}: {
  campaignId?: string;
  submissionId?: string;
  availablePlatforms: string[];
  minDate?: string;
  maxDate: string;
  initial?: SubmissionValues;
}) {
  const action = submissionId ? resubmitClip : submitClip;
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const title = submissionId ? "Update and resubmit" : "Submit published clip";
  return (
    <form action={formAction} className="workflow-form">
      {submissionId
        ? <input type="hidden" name="submission_id" value={submissionId} />
        : <input type="hidden" name="campaign_id" value={campaignId ?? ""} />}
      <div className="field"><label htmlFor="source_url">Original source link</label><input id="source_url" name="source_url" type="url" required maxLength={2048} defaultValue={initial?.sourceUrl ?? ""} placeholder="https://…" /><span className="field-help">Use the source permitted by the campaign brief.</span></div>
      <div className="field"><label htmlFor="published_url">Public link to your clip</label><input id="published_url" name="published_url" type="url" required maxLength={2048} defaultValue={initial?.publishedUrl ?? ""} placeholder="https://instagram.com/reel/…" /></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="platform">Publishing platform</label><select id="platform" name="platform" required defaultValue={initial?.platform ?? availablePlatforms[0] ?? ""}>{availablePlatforms.map((platform) => <option value={platform} key={platform}>{platformLabels[platform] ?? platform}</option>)}</select></div>
        <div className="field"><label htmlFor="published_date">Published on (India date)</label><input id="published_date" name="published_date" type="date" required min={minDate} max={maxDate} defaultValue={initial?.publishedDate ?? maxDate} /></div>
      </div>
      <div className="field"><label htmlFor="notes">Note for the reviewer (optional)</label><textarea id="notes" name="notes" maxLength={2000} rows={3} defaultValue={initial?.notes ?? ""} placeholder="Add context or flag an issue with the post link." /></div>
      <p className="field-help">Each published post can be submitted once. Views are not collected here and are never auto-fetched.</p>
      {state.error && <p role="alert" className="form-message error">{state.error}</p>}
      <div className="actions"><button className="button" disabled={pending}>{pending ? "Saving…" : title}</button></div>
    </form>
  );
}
