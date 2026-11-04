import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-line bg-ink2 p-7 text-center">
        <p className="mono text-xs tracking-[0.3em] text-volt">404</p>
        <h1 className="h-display text-2xl font-bold mt-3">Page not found</h1>
        <p className="text-mist text-sm leading-relaxed mt-2">
          The page you are looking for does not exist, or you may not have access to it.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
          <Link href="/" className="btn btn-volt">Home</Link>
          <Link href="/dashboard" className="btn btn-ghost">Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
