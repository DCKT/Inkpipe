import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { UnreadBadge } from "./UnreadBadge";
import { NAV_ITEMS, SETTINGS_NAV_ITEM } from "../lib/nav";

function SidebarContent() {
  return (
    <>
      <div className="border-b border-border px-5 py-4">
        <NavLink
          to="/"
          className="font-display text-lg italic text-primary no-underline"
        >
          Inkpipe
        </NavLink>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            title={item.label}
            className={({ isActive }) =>
              `spine-link ${isActive ? "is-active" : ""}`
            }
          >
            <span className="spine-numeral">{item.numeral}</span>
            <span className="spine-label hidden lg:inline">{item.label}</span>
            {item.path === "/watches" && (
              <span className="ml-auto hidden lg:inline-flex">
                <UnreadBadge />
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-border px-2 py-3">
        <NavLink
          to={SETTINGS_NAV_ITEM.path}
          title={SETTINGS_NAV_ITEM.label}
          className={({ isActive }) =>
            `spine-link spine-link-quiet ${isActive ? "is-active-quiet" : ""}`
          }
        >
          <span className="spine-numeral spine-numeral-quiet">
            {SETTINGS_NAV_ITEM.numeral}
          </span>
          <span className="spine-label hidden lg:inline">
            {SETTINGS_NAV_ITEM.label}
          </span>
        </NavLink>

        {import.meta.env.DEV && (
          <NavLink
            to="/debug"
            title="Debug"
            className={({ isActive }) =>
              `spine-link spine-link-dev ${isActive ? "is-active-quiet" : ""}`
            }
          >
            <span className="spine-label hidden lg:inline">Debug</span>
            <span className="lg:hidden">D</span>
            <span className="ml-auto hidden font-mono text-[9px] tracking-widest text-secondary lg:inline">
              DEV
            </span>
          </NavLink>
        )}
      </div>
    </>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <>
      {/* Edge tab that opens the drawer on small screens */}
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
        className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r-[3px] border border-l-0 border-border bg-surface px-1.5 py-3 text-secondary md:hidden"
      >
        <span className="block h-4 w-3.5 border-y-2 border-current" />
      </button>

      {/* Desktop / tablet sidebar: full spine at lg+, icon rail at md */}
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r border-border bg-surface md:flex lg:w-[220px]">
        <SidebarContent />
      </aside>

      {/* Mobile overlay drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[220px] flex-col border-r border-border bg-surface">
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
}
