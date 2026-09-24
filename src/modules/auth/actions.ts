"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

export async function authenticate(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = form.get("email");
  const password = form.get("password");
  const intent = form.get("intent");
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" ||
    password.length === 0 ||
    (intent !== "sign-in" && intent !== "sign-up")
  ) {
    return { error: "Enter a valid email and password." };
  }

  let hasSession = false;
  try {
    const supabase = await createClient();
    const credentials = { email: email.trim(), password };
    const { data, error } =
      intent === "sign-up"
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);
    if (error) {
      if (intent === "sign-up" && process.env.NODE_ENV === "development") {
        console.error("Supabase signup failed", {
          code: error.code,
          message: error.message,
        });
      }
      return {
        error:
          intent === "sign-up"
            ? "Unable to sign up. Check the password requirements and try again."
            : "Sign-in failed. Check your credentials and confirm your email.",
      };
    }
    hasSession = data.session !== null;
  } catch {
    return { error: "Authentication is unavailable. Please try again." };
  }

  if (hasSession) redirect("/organizations");
  return { message: "Check your email for a confirmation link, then sign in." };
}

export async function signOut(): Promise<AuthState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) return { error: "Unable to sign out. Please try again." };
  } catch {
    return { error: "Unable to sign out. Please try again." };
  }
  redirect("/auth");
}
