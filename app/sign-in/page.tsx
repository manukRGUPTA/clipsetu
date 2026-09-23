import { AuthForm } from "@/components/auth-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  const initialMode = params.mode === "signup" ? "signup" : "signin";
  return <div className="auth-wrap"><AuthForm initialMode={initialMode} /></div>;
}
