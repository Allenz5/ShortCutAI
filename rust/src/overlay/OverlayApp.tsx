import { MouseEvent, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./overlay.css";

export function OverlayApp() {
  const handlePointerEvent = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const activationRef = useRef(false);

  const triggerFloatingWindow = useCallback(() => {
    if (activationRef.current) {
      return;
    }
    activationRef.current = true;
    void (async () => {
      try {
        await invoke("show_floating_window");
      } catch (error) {
        console.warn("Failed to show floating window from overlay hover", error);
      } finally {
        try {
          await invoke("hide_overlay");
        } catch (error) {
          console.warn("Failed to hide overlay after hover activation", error);
        }
        activationRef.current = false;
      }
    })();
  }, []);

  return (
    <div className="overlay-root">
      <button
        className="overlay-button"
        onMouseDown={handlePointerEvent}
        onMouseUp={handlePointerEvent}
        onMouseEnter={triggerFloatingWindow}
      >
        <img src="/nerd.png" alt="GoBuddy" draggable={false} />
      </button>
    </div>
  );
}

export default OverlayApp;
