import React from 'react';
import './Tutorial.css';

function Step({ number, title, children, action }) {
  return (
    <section className="tutorial-step">
      <div className="step-number">{number}</div>
      <div className="step-body">
        <h2>{title}</h2>
        <p>{children}</p>
        {action}
      </div>
    </section>
  );
}

function Tutorial() {
  const handleOpenSettings = () => {
    window.api?.openSettings?.();
    window.api?.markTutorialSeen?.();
  };

  const handleClose = () => {
    window.api?.markTutorialSeen?.();
    window.close();
  };

  return (
    <div className="tutorial-container">
      <header>
        <h1>Welcome to TextBuddy</h1>
        <p>Follow these three quick steps and you’ll be rewriting text like a pro.</p>
      </header>

      <div className="tutorial-steps">
        <Step
          number="1"
          title="Add your OpenAI API key"
          action={
            <button onClick={handleOpenSettings}>
              Open Settings
            </button>
          }
        >
          Open Settings and paste your OpenAI key (starts with “sk-”). TextBuddy uses this to talk to the AI.
        </Step>

        <Step
          number="2"
          title="Record your hotkeys"
          action={
            <div className="step-actions">
              <span>Inline → replaces highlighted text</span>
              <span>Popup → shows the answer in a window</span>
            </div>
          }
        >
          Go to the main window, pick Inline and Popup, and click “Record Hotkey” to set shortcuts you can press from any app.
        </Step>

        <Step
          number="3"
          title="Create your presets"
        >
          Select “+ Add Preset”, give it a friendly name, and write the instructions you want TextBuddy to follow (translate, fix tone, summarize, etc.).
        </Step>
      </div>

      <footer>
        <button className="primary" onClick={handleClose}>I’m ready!</button>
      </footer>
    </div>
  );
}

export default Tutorial;
