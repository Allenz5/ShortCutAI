import { MouseEvent } from "react";
import "./overlay.css";

export function OverlayApp() {
  const handlePointerEvent = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="overlay-root">
      <button
        className="overlay-button"
        onMouseDown={handlePointerEvent}
        onMouseUp={handlePointerEvent}
      >
        <img src="/nerd.png" alt="GoBuddy" draggable={false} />
      </button>
    </div>
  );
}

export default OverlayApp;
