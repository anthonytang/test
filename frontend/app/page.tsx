import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold text-accent">Studio</span>
        </div>
        <Link
          href="/auth/signin"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 tracking-tight">
            AI-powered document analysis
          </h1>
          <p className="mt-6 text-lg text-gray-500 leading-relaxed">
            Extract insights from financial documents, research reports, and due diligence materials with precision.
          </p>
          <div className="mt-10">
            <Link
              href="/auth/signin"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-accent hover:bg-accent-600 rounded-lg transition-colors"
            >
              Get started
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-gray-400">
          <span>&copy; 2025 WhyAI Technologies, Inc.</span>
        </div>
      </footer>
    </div>
  );
}
