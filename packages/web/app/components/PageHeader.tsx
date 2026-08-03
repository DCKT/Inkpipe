import { NavLink } from "react-router-dom";
import { NAV_ITEMS, SETTINGS_NAV_ITEM } from "../lib/nav";

interface PageHeaderProps {
  /** Roman numeral shown in the eyebrow, e.g. "III". Omit and pass `eyebrow` for non-numbered pages. */
  numeral?: string;
  /** Route label shown uppercase in the eyebrow, e.g. "Komga". */
  label?: string;
  /** Full eyebrow override (used by Debug: "— — DEBUG (APPENDIX)"). */
  eyebrow?: string;
  /** Newsreader display title. */
  title: string;
  /** Right-aligned mono stat string, e.g. "1,204 series". Omit if no such stat exists. */
  meta?: string;
}

export function PageHeader({ numeral, label, eyebrow, title, meta }: PageHeaderProps) {
  const eyebrowText = eyebrow ?? `${numeral} — ${(label ?? "").toUpperCase()}`;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border pb-4">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-accent">
            {eyebrowText}
          </p>
          <h1 className="display-title mt-1 text-3xl font-bold text-primary">
            {title}
          </h1>
        </div>
        {meta && (
          <p className="shrink-0 pb-1 font-mono text-xs text-secondary">
            {meta}
          </p>
        )}
      </div>

      {/* Mobile-only quick tab strip, mirrors the sidebar's nav items */}
      <nav className="mt-3 flex gap-1 overflow-x-auto pb-1 md:hidden">
        {[...NAV_ITEMS, SETTINGS_NAV_ITEM].map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `nav-link shrink-0 whitespace-nowrap font-mono text-xs uppercase ${isActive ? "is-active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
