import Link from "next/link";

export function Footer() {
    return (
        <footer className="bg-surface/50 border-t border-white/5 py-12 px-4 mt-24">
            <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
                <div className="space-y-4 sm:col-span-2 lg:col-span-1">
                    <Link href="/" className="flex items-center opacity-80 hover:opacity-100 transition-opacity">
                        <span className="font-heading font-bold uppercase tracking-wide text-xl text-white">
                            Pickle<span className="text-primary">Play</span>
                        </span>
                    </Link>
                    <p className="text-text-muted text-sm leading-relaxed">
                        The ultimate platform for booking pickleball courts. Find and reserve your court with ease.
                    </p>
                </div>

                <div>
                    <h4 className="text-text font-bold uppercase mb-6 tracking-wide">Explore</h4>
                    <ul className="space-y-3 text-text-muted text-sm">
                        <li><Link href="/pickleball-courts" className="hover:text-primary transition-colors">Courts</Link></li>
                        <li><Link href="/my-bookings" className="hover:text-primary transition-colors">My Bookings</Link></li>
                        <li><Link href="/" className="hover:text-primary transition-colors">About Us</Link></li>
                    </ul>
                </div>

                <div>
                    <h4 className="text-text font-bold uppercase mb-6 tracking-wide">Legal</h4>
                    <ul className="space-y-3 text-text-muted text-sm">
                        <li><Link href="/" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                        <li><Link href="/" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                    </ul>
                </div>

            </div>

            <div className="max-w-7xl mx-auto border-t border-white/5 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-text-muted opacity-50">
                <p>© 2026 PicklePlay. All rights reserved.</p>
                <p>Built with Passion for the Court.</p>
            </div>
        </footer>
    );
}
