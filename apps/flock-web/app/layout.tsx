import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Flock — Agent Control Tower',
  description: 'Agent coordination and task management control center',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-secondary border-r border-border flex flex-col">
          {/* Logo */}
          <div className="p-4 border-b border-border">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">F</span>
              </div>
              <span className="font-semibold text-lg">Flock</span>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-4 space-y-1">
            <NavLink href="/dashboard" icon="📊">
              Dashboard
            </NavLink>
            <NavLink href="/projects" icon="📁">
              Projects
            </NavLink>

            {/* Status Indicators */}
            <div className="pt-4 border-t border-border mt-4">
              <StatusLink href="/runs?status=running" icon="⚡">
                Active Runs
              </StatusLink>
              <StatusLink href="/reviews?status=pending" icon="👀">
                Pending Reviews
              </StatusLink>
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border text-xs text-muted-foreground">
            Flock v0.1.0
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
    >
      <span className="text-base">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

function StatusLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: string;
  children: React.ReactNode;
}) {
  // TODO: Add actual counts from API
  const count = 0;

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span>{children}</span>
      </div>
      {count > 0 && (
        <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </Link>
  );
}
