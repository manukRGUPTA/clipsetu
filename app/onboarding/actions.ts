"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function splitList(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function optionalHttps(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const url = new URL(text);
  if (url.protocol !== "https:") throw new Error("Use a public HTTPS link.");
  return url.toString();
}

export async function saveOnboarding(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const role = String(formData.get("role") ?? "");
  const { data: roleRow } = await supabase.from("user_roles").select("role, status").eq("user_id", user.id).eq("role", role as "business" | "clipper").maybeSingle();
  if (!roleRow || !["pending", "active"].includes(roleRow.status)) throw new Error("This onboarding form is not available for your account status.");

  if (role === "business") {
    const companyName = String(formData.get("company_name") ?? "").trim();
    const contactName = String(formData.get("contact_name") ?? "").trim();
    const website = optionalHttps(formData.get("website_url"));
    if (companyName.length < 2) throw new Error("Enter a company or creator-team name.");
    const { data: current } = await supabase.from("businesses").select("id, status").eq("owner_id", user.id).maybeSingle();
    if (current?.status === "approved") throw new Error("Your approved business profile cannot be overwritten here.");
    const { error } = current
      ? await supabase.from("businesses").update({ company_name: companyName, contact_name: contactName, website_url: website, contact_email: user.email ?? null }).eq("id", current.id)
      : await supabase.from("businesses").insert({ owner_id: user.id, company_name: companyName, contact_name: contactName, website_url: website, contact_email: user.email ?? null });
    if (error) throw new Error("Could not save the business profile. Check the required fields and try again.");
  } else if (role === "clipper") {
    const languages = splitList(formData.get("languages"));
    const niches = splitList(formData.get("niches"));
    const portfolio = optionalHttps(formData.get("portfolio_url"));
    const { error } = await supabase.from("clipper_profiles").update({ languages, niches, portfolio_url: portfolio }).eq("user_id", user.id);
    if (error) throw new Error("Could not save the clipper profile. Check the links and try again.");
  } else {
    throw new Error("Choose a valid account type.");
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?profile=saved");
}
