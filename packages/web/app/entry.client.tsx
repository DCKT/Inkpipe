import { RouterProvider } from "react-router-dom";
import { createRoot } from "react-dom/client";
import { router } from "./router";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
}

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
