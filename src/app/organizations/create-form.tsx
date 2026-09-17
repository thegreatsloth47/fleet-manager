"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function CreateOrganizationForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get("name");
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.status === 401) {
        router.replace("/auth");
        router.refresh();
        return;
      }
      if (!response.ok) {
        setMessage(
          response.status === 400
            ? "Enter an organization name of 1 to 200 characters."
            : "Unable to create organization. Please try again.",
        );
        return;
      }
      form.reset();
      setMessage("Organization created. You are its owner.");
      router.refresh();
    } catch {
      setMessage(
        "The request could not be confirmed. Refresh the page before trying again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Create an organization</h2>
      <label>
        Name <input name="name" required maxLength={200} />
      </label>{" "}
      <button disabled={pending}>Create organization</button>
      <p role="status">{message}</p>
    </form>
  );
}
