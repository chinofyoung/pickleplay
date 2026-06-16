"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X, Calendar, BookOpen, Building2, ShieldCheck, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";

type AuthProp = {
    fullName: string | null;
    role: "player" | "owner" | "admin";
} | null;

const ALWAYS_VISIBLE_LINKS = [
    { label: "Courts", href: "/pickleball-courts", icon: Calendar },
];

const AUTH_ONLY_LINKS = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "My Bookings", href: "/my-bookings", icon: BookOpen },
];

export function Navbar({ auth }: { auth: AuthProp }) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [isScrolled, setIsScrolled] = React.useState(false);

    const pathname = usePathname();

    React.useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    React.useEffect(() => {
        let rafId: number;

        const handleScroll = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                setIsScrolled(window.scrollY > 10);
            });
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
            cancelAnimationFrame(rafId);
        };
    }, []);

    return (
        <>
            <nav
                className={cn(
                    "fixed top-0 left-0 right-0 z-[100] transition-all duration-300 py-8",
                    isScrolled ? "bg-background/80 backdrop-blur-md shadow-lg py-6" : "bg-transparent"
                )}
            >
                <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
                    {/* Mobile Toggle - Left side for consistency with dashboard */}
                    <button
                        className="md:hidden text-text p-2 hover:bg-white/5 rounded-lg"
                        onClick={() => setIsOpen(!isOpen)}
                        aria-expanded={isOpen}
                        aria-controls="mobile-nav-menu"
                        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
                    >
                        {isOpen ? <X /> : <Menu />}
                    </button>

                    <Link href="/" className="flex items-center transition-transform hover:scale-105 active:scale-95">
                        <span className="font-heading font-bold uppercase tracking-wide text-xl text-white">
                            Pickle<span className="text-primary">Play</span>
                        </span>
                    </Link>

                    {/* Desktop Nav */}
                    <div className="hidden md:flex items-center gap-8">
                        {ALWAYS_VISIBLE_LINKS.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="text-text-muted hover:text-primary font-medium transition-colors"
                            >
                                {link.label}
                            </Link>
                        ))}
                        {auth && AUTH_ONLY_LINKS.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="text-text-muted hover:text-primary font-medium transition-colors"
                            >
                                {link.label}
                            </Link>
                        ))}
                        {auth?.role === "owner" && (
                            <Link
                                href="/owner/pickleball-courts"
                                className="text-text-muted hover:text-primary font-medium transition-colors"
                            >
                                My Pickleball Courts
                            </Link>
                        )}
                        {auth?.role === "admin" && (
                            <Link
                                href="/admin/applications"
                                className="text-text-muted hover:text-primary font-medium transition-colors"
                            >
                                Admin
                            </Link>
                        )}

                        <div className="flex items-center gap-4 pl-4 border-l border-white/10">
                            {auth ? (
                                <>
                                    <span className="text-sm text-text-muted font-medium">{auth.fullName}</span>
                                    <form action={signOut}>
                                        <Button variant="outline" size="sm" type="submit">Sign out</Button>
                                    </form>
                                </>
                            ) : (
                                <>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href="/login">Sign In</Link>
                                    </Button>
                                    <Button variant="primary" size="sm" asChild>
                                        <Link href="/register">Register</Link>
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Spacer for mobile to balance the left burger menu */}
                    <div className="md:hidden w-10" />
                </div>
            </nav>

            {/* Mobile Nav Drawer - Outside <nav> to avoid overflow issues */}
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-[105] bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setIsOpen(false)} />
                    <div id="mobile-nav-menu" className="fixed top-0 left-0 bottom-0 z-[110] w-4/5 max-w-sm bg-sidebar border-r border-sidebar-border shadow-2xl animate-in slide-in-from-left md:hidden overflow-y-auto flex flex-col">
                        {/* Header: Logo + close button */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border shrink-0">
                            <Link href="/" onClick={() => setIsOpen(false)} className="block px-2 py-2">
                                <span className="font-heading font-bold uppercase tracking-wide text-xl text-white">
                                    Pickle<span className="text-primary">Play</span>
                                </span>
                            </Link>
                            <button
                                className="text-sidebar-foreground p-2 hover:bg-sidebar-accent rounded-lg transition-colors"
                                onClick={() => setIsOpen(false)}
                                aria-label="Close navigation menu"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Nav content */}
                        <div className="flex flex-col flex-1 py-2 overflow-y-auto">
                            {/* Browse group */}
                            <div className="px-4 py-2">
                                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1 px-2">Browse</p>
                                <div className="flex flex-col gap-1">
                                    {ALWAYS_VISIBLE_LINKS.map((link) => {
                                        const Icon = link.icon;
                                        const isActive = pathname === link.href;
                                        return (
                                            <Link
                                                key={link.href}
                                                href={link.href}
                                                onClick={() => setIsOpen(false)}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                                    isActive
                                                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                                )}
                                            >
                                                <Icon size={16} className="shrink-0" />
                                                <span>{link.label}</span>
                                            </Link>
                                        );
                                    })}
                                    {auth && AUTH_ONLY_LINKS.map((link) => {
                                        const Icon = link.icon;
                                        const isActive = pathname === link.href;
                                        return (
                                            <Link
                                                key={link.href}
                                                href={link.href}
                                                onClick={() => setIsOpen(false)}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                                    isActive
                                                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                                )}
                                            >
                                                <Icon size={16} className="shrink-0" />
                                                <span>{link.label}</span>
                                            </Link>
                                        );
                                    })}
                                    {auth?.role === "owner" && (
                                        <Link
                                            href="/owner/pickleball-courts"
                                            onClick={() => setIsOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                                pathname === "/owner/pickleball-courts"
                                                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                            )}
                                        >
                                            <Building2 size={16} className="shrink-0" />
                                            <span>My Pickleball Courts</span>
                                        </Link>
                                    )}
                                    {auth?.role === "admin" && (
                                        <Link
                                            href="/admin/applications"
                                            onClick={() => setIsOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                                pathname === "/admin/applications"
                                                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                            )}
                                        >
                                            <ShieldCheck size={16} className="shrink-0" />
                                            <span>Admin</span>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer: Auth controls */}
                        <div className="shrink-0 border-t border-sidebar-border px-6 py-4">
                            {auth ? (
                                <div className="flex flex-col gap-2">
                                    <p className="text-sm text-sidebar-foreground font-medium px-1 truncate">{auth.fullName}</p>
                                    <form action={signOut}>
                                        <Button className="w-full" variant="outline" type="submit">Sign out</Button>
                                    </form>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <Button className="w-full" variant="primary" asChild>
                                        <Link href="/login" onClick={() => setIsOpen(false)}>
                                            Sign In
                                        </Link>
                                    </Button>
                                    <Button className="w-full" variant="outline" asChild>
                                        <Link href="/register" onClick={() => setIsOpen(false)}>
                                            Register
                                        </Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
