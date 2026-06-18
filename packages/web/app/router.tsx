import { createBrowserRouter } from "react-router-dom";
import Root from "./root";
import HomePage from "./routes/home";
import LatestPage from "./routes/latest";
import ConvertPage from "./routes/convert";
import KomgaPage from "./routes/komga";
import JobsPage from "./routes/jobs";
import SettingsPage from "./routes/settings";
import DebugPage from "./routes/debug";
import WatchesPage from "./routes/watches";
import WatchDetailPage from "./routes/watch-detail";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: HomePage },
      { path: "latest", Component: LatestPage },
      { path: "convert", Component: ConvertPage },
      { path: "komga", Component: KomgaPage },
      { path: "jobs", Component: JobsPage },
      { path: "settings", Component: SettingsPage },
      { path: "watches", Component: WatchesPage },
      { path: "watches/:id", Component: WatchDetailPage },
      { path: "debug", Component: DebugPage },
    ],
  },
]);
