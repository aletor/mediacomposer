import { useCallback, useEffect, useState } from "react";
import {
  installPreserveDocumentFullscreenOnFilePicker,
  isDocumentFullscreen,
  subscribeFullscreenChange,
  toggleDocumentFullscreen,
} from "@/lib/fullscreen";

export function useSpacesBrowserFullscreen() {
  const [browserFullscreen, setBrowserFullscreen] = useState(false);

  useEffect(() => {
    setBrowserFullscreen(isDocumentFullscreen());
    return subscribeFullscreenChange(() => setBrowserFullscreen(isDocumentFullscreen()));
  }, []);

  useEffect(() => {
    return installPreserveDocumentFullscreenOnFilePicker();
  }, []);

  const togglePageFullscreen = useCallback(() => {
    void toggleDocumentFullscreen().catch((err) => {
      console.warn("[fullscreen]", err);
    });
  }, []);

  return { browserFullscreen, togglePageFullscreen };
}
