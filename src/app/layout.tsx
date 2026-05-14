import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { signOut } from "@/auth";
import SessionProvider from "@/components/SessionProvider";
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
    >
      <body className="min-h-full flex flex-col bg-gray-50">
        <SessionProvider session={session}>
          {session?.user && (
            <header className="bg-white border-b border-gray-200 shadow-sm">
              <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <Link
                    href="/dashboard"
                    className="text-lg font-semibold text-indigo-600 tracking-tight"
                  >
                    TimeCard
                  </Link>
                  {session.user.role === "admin" && (
                    <Link
                      href="/admin"
                      className="text-sm text-gray-600 hover:text-indigo-600 transition-colors"
                    >
                      Admin
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {session.user.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={session.user.image}
                      alt={session.user.name ?? ""}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  )}
                  <span className="text-sm text-gray-700">
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
                      className="text-sm text-gray-500 hover:text-red-500 transition-colors"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            </header>
          )}
          <main className="flex-1">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
