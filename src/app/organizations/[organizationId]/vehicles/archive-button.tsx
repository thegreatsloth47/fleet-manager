"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ArchiveButton({
  organizationId,
  assetId,
}: {
  organizationId: string;
  assetId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function archive() {
    if (
      pending ||
      !window.confirm(
        "Archive this vehicle? It will remain viewable but cannot be edited or restored.",
      )
    )
      return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/vehicles/${assetId}/archive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      if (response.status === 401) {
        router.replace("/auth");
        router.refresh();
        return;
      }
      if (!response.ok) {
        setMessage(
          "Unable to archive vehicle. Refresh to check your access and try again.",
        );
        return;
      }
      router.refresh();
      setMessage("Vehicle archived.");
    } catch {
      setMessage(
        "The archive could not be confirmed. Refresh before trying again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <button disabled={pending} onClick={archive}>
        {pending ? "Archiving…" : "Archive vehicle"}
      </button>
      <p role="status">{message}</p>
    </>
  );
}
