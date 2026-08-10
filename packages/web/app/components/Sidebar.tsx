import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { UnreadBadge } from "./UnreadBadge";
import { NAV_ITEMS, SETTINGS_NAV_ITEM, type NavSubLink } from "../lib/nav";
import { runApi } from "../lib/apiClient";

function isSubLinkActive(pathname: string, item: NavSubLink): boolean {
  if (item.end) return pathname === item.path;
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

function SidebarContent({ fullLabels = false }: { fullLabels?: boolean }) {
  const location = useLocation();

  const configQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => runApi((client) => client.settings.get({})),
    staleTime: 5 * 60 * 1000,
  });
  const copypartyUrl = configQuery.data?.copyparty.url;

  // Icon rail (lg, <xl) shows only numerals with a title tooltip; the full
  // sidebar (xl+) and the mobile overlay drawer both need the text labels.
  const labelClass = fullLabels
    ? "spine-label"
    : "spine-label hidden xl:inline";
  const letterFallbackClass = fullLabels ? "hidden" : "xl:hidden";

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
        {NAV_ITEMS.map((item) => {
          if (item.type === "link") {
            return (
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
                <span className={labelClass}>{item.label}</span>
                {item.path === "/watches" && (
                  <span
                    className={`ml-auto ${fullLabels ? "inline-flex" : "hidden xl:inline-flex"}`}
                  >
                    <UnreadBadge />
                  </span>
                )}
              </NavLink>
            );
          }

          const sectionActive = item.children.some((child) =>
            isSubLinkActive(location.pathname, child),
          );

          return (
            <div key={item.label} className="flex flex-col gap-0.5">
              <div
                className={`spine-link spine-link-section ${sectionActive ? "is-active" : ""}`}
                title={item.label}
              >
                <span className="spine-numeral">{item.numeral}</span>
                <span className={labelClass}>{item.label}</span>
              </div>
              {item.children.map((child) => (
                <NavLink
                  key={child.path}
                  to={child.path}
                  end={child.end}
                  title={child.label}
                  className={({ isActive }) =>
                    `spine-link spine-link-sub ${isActive ? "is-active" : ""}`
                  }
                >
                  <span className={labelClass}>{child.label}</span>
                  <span className={letterFallbackClass}>{child.label[0]}</span>
                </NavLink>
              ))}
              {item.label === "Utils" && copypartyUrl && (
                <a
                  href={copypartyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Copyparty"
                  className="spine-link spine-link-sub"
                >
                  <span className={labelClass}>Copyparty</span>
                  <span className={letterFallbackClass}>C</span>
                </a>
              )}
            </div>
          );
        })}
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
          <span className={labelClass}>{SETTINGS_NAV_ITEM.label}</span>
        </NavLink>

        {import.meta.env.DEV && (
          <NavLink
            to="/debug"
            title="Debug"
            className={({ isActive }) =>
              `spine-link spine-link-dev ${isActive ? "is-active-quiet" : ""}`
            }
          >
            <span className={labelClass}>Debug</span>
            <span className={letterFallbackClass}>D</span>
            <span
              className={`ml-auto font-mono text-[9px] tracking-widest text-secondary ${fullLabels ? "inline" : "hidden xl:inline"}`}
            >
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
      {/* Mobile top bar: hamburger trigger + logo, only below lg */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface px-4 xl:hidden">
        <NavLink
          to="/"
          className="font-display text-lg italic text-primary no-underline"
        >
          Inkpipe
        </NavLink>
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-[3px] border border-border bg-surface text-secondary"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Desktop / tablet sidebar: full spine at xl+, icon rail at lg */}
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r border-border bg-surface xl:flex xl:w-[220px]">
        <SidebarContent />
      </aside>

      {/* Mobile overlay drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex xl:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[220px] flex-col border-r border-border bg-surface">
            <SidebarContent fullLabels />
          </aside>
        </div>
      )}
    </>
  );
}
