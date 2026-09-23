"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function verifiedAdmin() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: claimData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()]);
  if (!user || claimData?.claims?.aal !== "aal2") throw new Error("A verified admin MFA session is required.");
  const { data: role } = await supabase.from("user_roles").select("user_id").eq("user_id", user.id).eq("role", "admin").eq("status", "active").maybeSingle();
  if (!role) throw new Error("An active admin role is required.");
  return supabase;
}

export async function reviewBusiness(formData: FormData) {
  const supabase = await verifiedAdmin();
  const businessId = String(formData.get("business_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!businessId || !["approved", "rejected", "suspended"].includes(decision)) throw new Error("Invalid business review request.");
  if (decision !== "approved" && !reason) throw new Error("A reason is required for rejection or suspension.");
  const { error } = await supabase.rpc("admin_review_business", { p_business_id: businessId, p_decision: decision as "approved" | "rejected" | "suspended", p_reason: reason || null });
  if (error) throw new Error("Business review was not saved. Check the reason and account status.");
  revalidatePath("/admin"); revalidatePath("/dashboard");
}

export async function reviewCampaign(formData: FormData) {
  const supabase = await verifiedAdmin();
  const campaignId = String(formData.get("campaign_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!campaignId || !["published", "changes_requested", "rejected"].includes(decision)) throw new Error("Invalid campaign review request.");
  if (decision !== "published" && !reason) throw new Error("A reason is required for changes or rejection.");
  const { error } = await supabase.rpc("admin_review_campaign", { p_campaign_id: campaignId, p_decision: decision as "published" | "changes_requested" | "rejected", p_reason: reason || null });
  if (error) throw new Error("Campaign review was not saved. Check its source rights and terms.");
  revalidatePath("/admin"); revalidatePath("/dashboard");
}

export async function reviewSubmission(formData: FormData) {
  const supabase = await verifiedAdmin();
  const submissionId = String(formData.get("submission_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(submissionId) || !["under_review", "changes_requested", "accepted", "rejected"].includes(decision)) {
    throw new Error("Invalid submission review request.");
  }
  if (["changes_requested", "rejected"].includes(decision) && !reason) throw new Error("A reason is required for corrections or rejection.");
  const { error } = await supabase.rpc("admin_review_submission", {
    p_submission_id: submissionId,
    p_decision: decision as "under_review" | "changes_requested" | "accepted" | "rejected",
    p_reason: reason || null,
  });
  if (error) throw new Error("Submission review was not saved. It may already have been reviewed.");
  revalidatePath("/admin"); revalidatePath("/dashboard/submissions"); revalidatePath("/dashboard/campaigns");
}

export async function reviewRoleRequest(formData: FormData) {
  const supabase = await verifiedAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!userId || !["business", "clipper"].includes(role) || !["active", "rejected", "suspended"].includes(status)) {
    throw new Error("Invalid account role review request.");
  }
  if (status !== "active" && !reason) throw new Error("A reason is required for rejection or suspension.");
  const { error } = await supabase.rpc("admin_set_user_role", {
    p_user_id: userId,
    p_role: role as "business" | "clipper",
    p_status: status as "active" | "rejected" | "suspended",
    p_reason: reason || null,
  });
  if (error) throw new Error("Role review was not saved.");
  revalidatePath("/admin"); revalidatePath("/dashboard");
}
