"use client";

import { useEffect } from "react";

export default function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const registerExistingWorker = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // PWA support is progressive enhancement; navigation remains available.
      });
    };

    if (document.readyState === "complete") registerExistingWorker();
    else window.addEventListener("load", registerExistingWorker, { once: true });

    return () => window.removeEventListener("load", registerExistingWorker);
  }, []);

  return null;
}
