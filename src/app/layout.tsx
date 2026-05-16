import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { signOut } from "@/auth";
import Providers from "@/components/SessionProvider";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TimeCard",
  description: "Employee timecard management",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <Providers>
          {session?.user && (
            <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <Link
                    href="/dashboard"
                    className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 tracking-tight"
                  >
                    TimeCard
                  </Link>
                  {session.user.role === "admin" && (
                    <Link
                      href="/admin"
                      className="text-sm text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      Admin
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <ThemeToggle />
                  {session.user.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={session.user.image}
                      alt={session.user.name ?? ""}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    {session.user.name}
                  </span>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <button
                      type="submit"
                      className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            </header>
          )}
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
