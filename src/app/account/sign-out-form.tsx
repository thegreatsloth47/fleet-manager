"use client";

import { useActionState } from "react";
import { signOut } from "@/modules/auth/actions";

export default function SignOutForm() {
  const [state, action, pending] = useActionState(signOut, {});
  return (
    <form action={action}>
      <button disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </button>
      <p role="status">{state.error}</p>
    </form>
  );
}
