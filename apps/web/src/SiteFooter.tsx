const FOOTER_LINKS = [
  { href: "/", label: "Professions" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
] as const;

function normalizedPathname(): string {
  if (typeof window === "undefined") return "/";
  const pathname = window.location.pathname.replace(/\/+$/, "");
  return pathname.length === 0 ? "/" : pathname;
}

export function SiteFooter() {
  const pathname = normalizedPathname();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-summary">
          <a className="site-footer-brand" href="/" aria-label="Forever Professions home">
            <span className="site-footer-mark" aria-hidden="true">F</span>
            <span>Forever <span>Professions</span></span>
          </a>
          <p>A community-built profession planner for WoW Forever players.</p>
        </div>
        <nav aria-label="Site links">
          {FOOTER_LINKS.map(({ href, label }) => (
            <a aria-current={pathname === href ? "page" : undefined} href={href} key={href}>
              {label}
            </a>
          ))}
          <a
            href="https://github.com/crazyskateface/wow-forever-professions"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </nav>
      </div>
      <p className="site-footer-disclaimer">
        Not affiliated with or endorsed by Blizzard Entertainment. All game names and
        related assets belong to their respective owners.
      </p>
    </footer>
  );
}
