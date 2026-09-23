import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveOnboarding } from "./actions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: roles } = await supabase.from("user_roles").select("role, status").eq("user_id", user.id);
  const role = roles?.find((item) => item.role === "business" || item.role === "clipper");
  if (!role) redirect("/dashboard");

  return (
    <div className="auth-wrap">
      <section className="auth-card">
        <p className="eyebrow">Account onboarding</p>
        <h1>Complete your {role.role} profile</h1>
        <p>These details stay in your account and are reviewed before business actions are enabled.</p>
        <form action={saveOnboarding}>
          <input type="hidden" name="role" value={role.role} />
          {role.role === "business" ? (
            <>
              <div className="field"><label htmlFor="company_name">Company, brand, or creator team</label><input id="company_name" name="company_name" minLength={2} maxLength={160} required /></div>
              <div className="field"><label htmlFor="contact_name">Contact name</label><input id="contact_name" name="contact_name" maxLength={120} defaultValue={user.user_metadata?.full_name ?? ""} /></div>
              <div className="field"><label htmlFor="website_url">Website (optional)</label><input id="website_url" name="website_url" type="url" placeholder="https://example.in" /></div>
              <p className="field-help">Your profile starts as pending. Campaign budgets are plans, not money deposited or held by Clipsetu.</p>
            </>
          ) : (
            <>
              <div className="field"><label htmlFor="languages">Languages</label><input id="languages" name="languages" placeholder="Hindi, English, Bhojpuri" maxLength={300} /><span className="field-help">Separate with commas.</span></div>
              <div className="field"><label htmlFor="niches">Content niches</label><input id="niches" name="niches" placeholder="Business, podcasts, education" maxLength={300} /><span className="field-help">Separate with commas.</span></div>
              <div className="field"><label htmlFor="portfolio_url">Portfolio (optional)</label><input id="portfolio_url" name="portfolio_url" type="url" placeholder="https://…" /></div>
              <p className="field-help">Profile approval is separate from verified views and campaign rewards.</p>
            </>
          )}
          <button className="button" type="submit">Save profile</button>
        </form>
      </section>
    </div>
  );
}
