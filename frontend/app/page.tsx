import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* Navigation */}
      <nav className="absolute top-0 w-full z-10">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-accent rounded-xl shadow-sm flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <span className="text-xl font-bold text-accent">Studio</span>
            </div>
            <div className="flex items-center">
              <Link
                href="/auth/signin"
                className="text-sm font-medium px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-600 transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative pt-40 pb-32 px-6 min-h-screen flex items-center">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center">
            {/* Main Heading */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-gray-600 mb-8">
              The AI platform for
              <span className="block text-accent font-bold leading-relaxed pb-1">
                financial document analysis
              </span>
            </h1>

            {/* CTA Button */}
            <div className="flex justify-center">
              <Link
                href="/auth/signin"
                className="group relative px-8 py-4 text-base font-medium text-white bg-accent hover:bg-accent-600 rounded-full transition-all duration-200 shadow-xl hover:shadow-2xl"
              >
                Get Started
                <span className="ml-2 group-hover:translate-x-1 transition-transform inline-block">
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>

    </main>
  );
}
