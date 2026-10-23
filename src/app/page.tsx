import Link from "next/link";
export default function HomePage() {
  return (
    <main>
      <h1>Fleet Manager</h1>
      <Link href="/auth">Sign up or sign in</Link>
      <p>
        <Link href="/organizations">Your organizations</Link>
      </p>
    </main>
  );
}
