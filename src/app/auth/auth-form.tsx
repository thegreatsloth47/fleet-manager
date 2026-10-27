"use client";

import Link from "next/link";

import { useActionState } from "react";
import { authenticate } from "@/modules/auth/actions";

export default function AuthForm() {
  const [state, action, pending] = useActionState(authenticate, {});

  return (
    <main>
      <h1>Sign up or sign in</h1>
      <form action={action}>
        <p>
          <label>
            Email{" "}
            <input name="email" type="email" autoComplete="username" required />
          </label>
        </p>
        <p>
          <label>
            Password{" "}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
        </p>
        <button disabled={pending} name="intent" value="sign-in">
          Sign in
        </button>{" "}
        <button disabled={pending} name="intent" value="sign-up">
          Sign up
        </button>
      </form>
      <p role="status">{state.error ?? state.message}</p>
      <Link href="/organizations">Your organizations</Link>
    </main>
  );
}
