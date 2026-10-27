import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutForm from "./sign-out-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user || error) redirect("/auth");
  return (
    <main>
      <h1>Account</h1>
      <p>
        Signed in as <strong>{user.email}</strong>
      </p>
      <p>
        <Link href="/organizations">Your organizations</Link>
      </p>
      <SignOutForm />
    </main>
  );
}
