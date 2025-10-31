import React from 'react';
import ReactDOM from 'react-dom/client';

const PROCESSING_STATUSES = new Set(['input', 'selection']);

function FloatingButton() {
  const [isHovered, setIsHovered] = React.useState(false);
  const [status, setStatus] = React.useState('idle');
  const dragStateRef = React.useRef(null);
  const processingRef = React.useRef(false);
  const pointerScreenPosition = React.useCallback((evt) => {
    if (!evt) return { x: 0, y: 0 };
    if (typeof evt.screenX === 'number' && typeof evt.screenY === 'number') {
      return { x: evt.screenX, y: evt.screenY };
    }
    if (typeof window !== 'undefined') {
      const baseX = typeof window.screenX === 'number' ? window.screenX : window.screenLeft || 0;
      const baseY = typeof window.screenY === 'number' ? window.screenY : window.screenTop || 0;
      const clientX = typeof evt.clientX === 'number' ? evt.clientX : 0;
      const clientY = typeof evt.clientY === 'number' ? evt.clientY : 0;
      return { x: baseX + clientX, y: baseY + clientY };
    }
    return {
      x: typeof evt.clientX === 'number' ? evt.clientX : 0,
      y: typeof evt.clientY === 'number' ? evt.clientY : 0,
    };
  }, []);
  const assetSources = React.useMemo(() => {
    const resolve = (relativePath) => {
      if (typeof window === 'undefined') return relativePath;
      try {
        return new URL(relativePath, window.location.href).toString();
      } catch {
        return relativePath;
      }
    };
    return {
      idle: resolve('./assets/floating/nerd.png'),
      input: resolve('./assets/floating/thinking1.png'),
      selection: resolve('./assets/floating/thinking2.png'),
    };
  }, []);

  React.useEffect(() => {
    const unsubscribe = window.api?.onAIProcessing?.((nextStatus) => {
      if (typeof nextStatus === 'string') {
        setStatus(nextStatus);
      } else {
        setStatus(nextStatus ? 'input' : 'idle');
      }
    });
    return unsubscribe;
  }, []);

  const isProcessing = PROCESSING_STATUSES.has(status);
  React.useEffect(() => {
    processingRef.current = isProcessing;
  }, [isProcessing]);

  const scheduleMoveFrame = React.useCallback(() => {
    const state = dragStateRef.current;
    if (!state) return;
    if (state.moveFrame != null) return;
    state.moveFrame = requestAnimationFrame(() => {
      const current = dragStateRef.current;
      if (!current) return;
      current.moveFrame = null;
      const pos = current.pendingPosition;
      if (!pos) return;
      current.pendingPosition = null;
      window.api?.moveFloatingWindow?.({
        x: Math.round(pos.x),
        y: Math.round(pos.y),
      });
    });
  }, []);

  const handlePointerDown = React.useCallback((event) => {
    if (event.button != null && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    const screenPos = pointerScreenPosition(event);
    const state = {
      pointerId: event.pointerId,
      startScreenX: screenPos.x,
      startScreenY: screenPos.y,
      offsetX: 0,
      offsetY: 0,
      moved: false,
      pendingPosition: null,
      moveFrame: null,
      ready: false,
    };
    dragStateRef.current = state;
    const getBounds = window.api?.getFloatingWindowBounds;
    if (!getBounds) {
      state.ready = true;
      return;
    }
    getBounds().then((bounds) => {
      const current = dragStateRef.current;
      if (!current || current.pointerId !== state.pointerId) return;
      if (bounds && typeof bounds.x === 'number' && typeof bounds.y === 'number') {
        current.offsetX = state.startScreenX - bounds.x;
        current.offsetY = state.startScreenY - bounds.y;
      }
      current.ready = true;
    }).catch(() => {
      const current = dragStateRef.current;
      if (!current || current.pointerId !== state.pointerId) return;
      current.ready = true;
    });
  }, [pointerScreenPosition]);

  const handlePointerMove = React.useCallback((event) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.ready) return;
    const screenPos = pointerScreenPosition(event);
    const dx = screenPos.x - state.startScreenX;
    const dy = screenPos.y - state.startScreenY;
    if (!state.moved) {
      const distance = Math.hypot(dx, dy);
      if (distance >= 3) {
        state.moved = true;
      }
    }
    if (state.moved) {
      const nextX = screenPos.x - state.offsetX;
      const nextY = screenPos.y - state.offsetY;
      state.pendingPosition = { x: nextX, y: nextY };
      scheduleMoveFrame();
    }
  }, [pointerScreenPosition, scheduleMoveFrame]);

  const finalizeMove = React.useCallback(() => {
    const state = dragStateRef.current;
    if (!state) return;
    if (state.moveFrame != null) {
      cancelAnimationFrame(state.moveFrame);
      state.moveFrame = null;
    }
    const pos = state.pendingPosition;
    state.pendingPosition = null;
    if (pos) {
      window.api?.moveFloatingWindow?.({
        x: Math.round(pos.x),
        y: Math.round(pos.y),
      });
    }
  }, []);

  const handlePointerEnd = React.useCallback((event) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    finalizeMove();
    const moved = state.moved;
    dragStateRef.current = null;
    if (!moved && !processingRef.current) {
      window.api?.showMainWindow?.();
    }
  }, [finalizeMove]);

  const handlePointerUp = React.useCallback((event) => {
    handlePointerEnd(event);
  }, [handlePointerEnd]);

  const handlePointerCancel = React.useCallback((event) => {
    handlePointerEnd(event);
  }, [handlePointerEnd]);

  const imageSrc =
    status === 'selection'
      ? assetSources.selection
      : status === 'input'
        ? assetSources.input
        : assetSources.idle;
  const imageAlt =
    status === 'selection'
      ? 'AI processing selection'
      : status === 'input'
        ? 'AI processing input'
        : 'AI ready';

  return (
    <div style={{
      width: 64,
      height: 64,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: isProcessing
            ? 'linear-gradient(135deg, #FFD93D 0%, #FFC107 100%)'
            : isHovered 
              ? 'linear-gradient(135deg, #FFFFFF 0%, #F5F5F5 100%)'
              : 'linear-gradient(135deg, #FFFFFF 0%, #FAFAFA 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isProcessing ? 'wait' : 'pointer',
          boxShadow: isProcessing
            ? '0 8px 24px rgba(255, 193, 7, 0.3), 0 0 0 1px rgba(255, 193, 7, 0.2)'
            : isHovered
              ? '0 8px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.08)'
              : '0 4px 16px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isHovered && !isProcessing ? 'scale(1.02)' : 'scale(1)',
          animation: isProcessing ? 'pulse 1.5s ease-in-out infinite' : 'none',
          userSelect: 'none',
          WebkitAppRegion: 'no-drag',
          touchAction: 'none',
        }}
      >
        <style>
          {`
            @keyframes pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.05); }
            }
            @keyframes rotate {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
        
        <img
          src={imageSrc}
          alt={imageAlt}
          style={{
            width: 32,
            height: 32,
            objectFit: 'contain',
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FloatingButton />
  </React.StrictMode>
);
