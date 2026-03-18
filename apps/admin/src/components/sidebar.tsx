"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Car,
  Users,
  Route,
  CreditCard,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/drivers", label: "Drivers", icon: Car },
  { href: "/riders", label: "Riders", icon: Users },
  { href: "/rides", label: "Rides", icon: Route },
  { href: "/credits", label: "Credits", icon: CreditCard },
  { href: "/settings/fare", label: "Fare Config", icon: Settings },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-zinc-200 bg-white">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-zinc-200 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900">
          <span className="text-sm font-extrabold text-white">O</span>
        </div>
        <Link href="/" className="flex items-baseline gap-0" onClick={onNavigate}>
          <span className="text-lg font-black tracking-tighter text-zinc-900" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
            omb
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-200 p-4">
        <p className="text-xs text-zinc-400">omb admin v0.1</p>
      </div>
    </aside>
  );
}
