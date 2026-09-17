"use client";

import { useActionState } from "react";
import { authenticate, signOut } from "@/modules/auth/actions";

export default function AuthPage() {
  const [state, action, pending] = useActionState(authenticate, {});
  const [signOutState, signOutAction, signingOut] = useActionState(signOut, {});

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
        <button disabled={pending || signingOut} name="intent" value="sign-in">
          Sign in
        </button>{" "}
        <button disabled={pending || signingOut} name="intent" value="sign-up">
          Sign up
        </button>
      </form>
      <p role="status">{state.error ?? state.message}</p>
      <form action={signOutAction}>
        <button disabled={pending || signingOut}>Sign out</button>
      </form>
      <p role="status">{signOutState.error}</p>
      <a href="/organizations">Your organizations</a>
    </main>
  );
}
