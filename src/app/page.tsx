import Link from "next/link";
export default function HomePage() {
  return (
    <main>
      <h1>Fleet Manager</h1>
      <a href="/auth">Sign up or sign in</a>
      <p>
        <Link href="/organizations">Your organizations</Link>
      </p>
    </main>
  );
}
