import "./styles.css";
import { NavLink, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastGroup } from "./ui/toast";
import { UnreadBadge } from "./components/UnreadBadge";

const queryClient = new QueryClient();

export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur-md">
          <div className="page-wrap flex items-center justify-between py-3">
            <NavLink to="/" className="text-lg font-bold text-[var(--sea-ink)] no-underline">
              Inkpipe
            </NavLink>
            <nav className="flex gap-6 text-sm font-medium">
              <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}>
                Search
              </NavLink>
              <NavLink to="/latest" className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}>
                Latest
              </NavLink>
              <NavLink to="/convert" className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}>
                Convert
              </NavLink>
              <NavLink to="/komga" className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}>
                Komga
              </NavLink>
              <NavLink to="/jobs" className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}>
                Jobs
              </NavLink>
              <NavLink to="/watches" className={({ isActive }) => `nav-link flex items-center gap-1 ${isActive ? "is-active" : ""}`}>
                Watches
                <UnreadBadge />
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}>
                Settings
              </NavLink>
              {import.meta.env.DEV && (
                <NavLink to="/debug" className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}>
                  Debug
                </NavLink>
              )}
            </nav>
          </div>
        </header>
        <Outlet />
        <ToastGroup.Toaster />
      </div>
    </QueryClientProvider>
  );
}
