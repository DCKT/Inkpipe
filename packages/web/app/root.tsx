import "./styles.css";
import { Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastGroup } from "./ui/toast";
import { Sidebar } from "./components/Sidebar";
import { JobsDrawer } from "./components/JobsDrawer";

const queryClient = new QueryClient();

export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
      <JobsDrawer />
      <ToastGroup.Toaster />
    </QueryClientProvider>
  );
}
