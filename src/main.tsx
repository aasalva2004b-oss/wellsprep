import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { FirebaseProvider } from './lib/FirebaseProvider.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import { ThemeProvider } from './lib/ThemeProvider.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <FirebaseProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </FirebaseProvider>
    </ThemeProvider>
  </StrictMode>,
);
