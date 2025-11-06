import React from 'react';
import ReactDOM from 'react-dom/client';

function SelectionButton() {
  const [isHovered, setIsHovered] = React.useState(false);

  const handleClick = () => {
    // TODO: Implement selection action logic
    console.log('Selection button clicked');
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: isHovered 
          ? 'linear-gradient(135deg, #FFFFFF 0%, #F5F5F5 100%)'
          : 'linear-gradient(135deg, #FFFFFF 0%, #FAFAFA 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: isHovered
          ? '0 4px 12px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.08)'
          : '0 2px 8px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.06)',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isHovered ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      {/* Smiley face icon - same as floating window */}
      <svg
        width="18"
        height="18"
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SelectionButton />
  </React.StrictMode>
);

