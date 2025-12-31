import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './app/App';
import { AppProviders } from './app/providers';

import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Root element not found. Make sure index.html contains <div id="root" />.',
  );
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
