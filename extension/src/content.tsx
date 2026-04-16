import React from 'react';
import ReactDOM from 'react-dom/client';
import RiskAnalysis from './extensionterms/RiskAnalysis';

declare global {
  interface Window {
    chrome: typeof chrome;
  }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.analysisResults) {
    const results = changes.analysisResults.newValue;

    if (results) {
      const existingContainer = document.getElementById('ezi-terms-analysis-container');
      if (existingContainer) {
        existingContainer.remove();
      }

      const container = document.createElement('div');
      container.id = 'ezi-terms-analysis-container';
      document.body.appendChild(container);

      const handleClose = () => {
        container.remove();
      };

      const root = ReactDOM.createRoot(container);
      root.render(<RiskAnalysis risks={results} onClose={handleClose} />);
    } else {
      const existingContainer = document.getElementById('ezi-terms-analysis-container');
      if (existingContainer) {
        existingContainer.remove();
      }
    }
  }
});
