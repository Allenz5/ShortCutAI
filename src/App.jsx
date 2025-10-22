import React from 'react';
import './App.css';

function App() {
  const message = window.api ? window.api.hello() : 'Loading...';

  return (
    <div className="app">
      <h1>Hello Electron 👋</h1>
      <p className="message">{message}</p>
      <div className="info">
        <p>Welcome to your React + Electron application!</p>
        <p>Click <strong>Settings</strong> in the menu bar to configure the app.</p>
      </div>
    </div>
  );
}

export default App;

