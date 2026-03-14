import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import PrimeReact from 'primereact/api';
import { store } from './store';
import App from './App';
import './index.css';

// Configure PrimeReact globally
PrimeReact.ripple = true;
PrimeReact.inputStyle = 'outlined';
PrimeReact.autoZIndex = true;
PrimeReact.hideOverlaysOnDocumentScrolling = false;
PrimeReact.zIndex = {
  modal: 1100,
  overlay: 1000,
  menu: 1000,
  tooltip: 1100,
};

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('Root element not found!');
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <Provider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </StrictMode>
  );
}
