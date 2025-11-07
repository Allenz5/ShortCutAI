import React, { useState, useEffect } from 'react';
import './App.css';
import InputField from './InputField';

function App() {
  const [currentView, setCurrentView] = useState('inline');

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
      case 'inline':
        return <InputField />;
      
      case 'popup':
        return (
          <div className="view-content">
            <h1>Popup View</h1>
            <p className="view-description">
              This is the Popup view. Here you can work with selected text in a dialog.
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
                <li><strong>Inline</strong> - Process text inline</li>
                <li><strong>Popup</strong> - Process text in a floating dialog</li>
              </ul>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="app">
      <div className="content-container">
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
