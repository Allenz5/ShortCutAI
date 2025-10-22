import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('home');

  useEffect(() => {
    // Listen for view changes from the menu
    if (window.api && window.api.onChangeView) {
      window.api.onChangeView((view) => {
        setCurrentView(view);
      });
    }
  }, []);

  const renderContent = () => {
    switch (currentView) {
      case 'inputfield':
        return (
          <div className="view-content">
            <h1>InputField View</h1>
            <p className="view-description">
              This is the InputField view. Here you can process text input.
            </p>
          </div>
        );
      
      case 'selection':
        return (
          <div className="view-content">
            <h1>Selection View</h1>
            <p className="view-description">
              This is the Selection view. Here you can work with selected text.
            </p>
          </div>
        );
      
      case 'screenshot':
        return (
          <div className="view-content">
            <h1>ScreenShot View</h1>
            <p className="view-description">
              This is the ScreenShot view. Here you can capture and process screenshots.
            </p>
          </div>
        );
      
      default:
        return (
          <div className="view-content">
            <h1>Hello Electron 👋</h1>
            <p className="message">Welcome to your React + Electron application!</p>
            <div className="info">
              <p>Select a view from the menu bar:</p>
              <ul>
                <li><strong>Settings</strong> - Configure the app</li>
                <li><strong>InputField</strong> - Process text input</li>
              </ul>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="app">
      {renderContent()}
    </div>
  );
}

export default App;

