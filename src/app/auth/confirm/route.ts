import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };

  if (tokenHash && type === "email") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (!error) {
      // Fixed destination: never trust a return URL supplied in an email link.
      return NextResponse.redirect(new URL("/organizations", url.origin), {
        status: 303,
        headers,
      });
    }
  }
  return NextResponse.json(
    {
      error:
        "This confirmation link is invalid or expired. Return to /auth to sign in or sign up.",
    },
    { status: 400, headers },
  );
}
