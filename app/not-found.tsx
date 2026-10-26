import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap intro">
      <h1 className="title small-title">Nobody&apos;s here.</h1>
      <p className="sub">This page went quiet.</p>
      <p>
        <Link href="/">Back to the séance</Link>
      </p>
    </main>
  );
}
