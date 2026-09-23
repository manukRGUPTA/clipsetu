import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export function SignOutButton() {
  return <form action={signOut}><button className="button button-secondary button-small" type="submit">Sign out</button></form>;
}
