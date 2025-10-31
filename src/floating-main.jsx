import React from 'react';
import ReactDOM from 'react-dom/client';

function FloatingButton() {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    window.api.onAIProcessing((processing) => {
      setIsProcessing(processing);
    });
  }, []);

  const handleClick = React.useCallback(() => {
    if (!isProcessing) {
      window.api?.showMainWindow?.();
    }
  }, [isProcessing]);

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
      
      {isProcessing ? (
        // Thinking face
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Face circle */}
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke="#000000"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Left eye - focused/thinking */}
          <circle cx="12" cy="13" r="1.5" fill="#000000" />
          {/* Right eye - focused/thinking */}
          <circle cx="20" cy="13" r="1.5" fill="#000000" />
          {/* Thinking mouth - straight line */}
          <line
            x1="11"
            y1="20"
            x2="21"
            y2="20"
            stroke="#000000"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Thought bubbles */}
          <circle cx="25" cy="8" r="1.5" fill="#000000" opacity="0.6" />
          <circle cx="27" cy="5" r="1" fill="#000000" opacity="0.4" />
        </svg>
      ) : (
        // Smiley face
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Face circle */}
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke="#000000"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Left eye */}
          <circle cx="12" cy="13" r="1.5" fill="#000000" />
          {/* Right eye */}
          <circle cx="20" cy="13" r="1.5" fill="#000000" />
          {/* Smile */}
          <path
            d="M 11 19 Q 16 23 21 19"
            stroke="#000000"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FloatingButton />
  </React.StrictMode>
);