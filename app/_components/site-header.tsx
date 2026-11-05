import Link from "next/link";

export type NavItem = { href: string; label: string };

/** Sticky header: brand mark + primary navigation. `name` is the project name; its first letter becomes the logo mark. */
export function SiteHeader({ name, links }: { name: string; links: NavItem[] }) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            {name.charAt(0).toUpperCase()}
          </span>
          <span>{name}</span>
        </Link>
        <nav aria-label="Primary" className="nav-list">
          {links.map((link) => (
            <a key={link.href} className="nav-link" href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
