import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuthForm from "./auth-form";

export const dynamic = "force-dynamic";

export default async function AuthPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (user && !error) redirect("/account");
  return <AuthForm />;
}
