import { Runtime } from "foldkit"

import "./styles.css"
import { Message, Model, init, update, view } from "./main"

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js")
}

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container: document.getElementById("root"),
  routing: {
    onUrlRequest: (request) => Message.ClickedLink({ request }),
    onUrlChange: (url) => Message.ChangedUrl({ url }),
  },
  devTools: {
    Message,
  },
})

Runtime.run(application)
