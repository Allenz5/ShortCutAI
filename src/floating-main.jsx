import React from 'react';
import ReactDOM from 'react-dom/client';

const PROCESSING_STATUSES = new Set(['input', 'selection']);

function FloatingButton() {
  const [isHovered, setIsHovered] = React.useState(false);
  const [status, setStatus] = React.useState('idle');
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

  const handleClick = React.useCallback(() => {
    if (!isProcessing) {
      window.api?.showMainWindow?.();
    }
  }, [isProcessing]);
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
    <div
      onClick={handleClick}
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
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FloatingButton />
  </React.StrictMode>
);
