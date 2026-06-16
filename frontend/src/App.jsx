import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { WSProvider } from './context/WSContext';
import { ThemeProvider } from './context/ThemeContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Posts from './pages/Posts';
import Groups from './pages/Groups';
import Sessions from './pages/Sessions';
import Filters from './pages/Filters';
import FacebookBrowser from './pages/FacebookBrowser';
import { useEffect, useRef } from 'react';

// Listener para navegação via Electron — registrado UMA única vez
function ElectronNavigator() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate; // sempre atualizado, sem re-registrar

  useEffect(() => {
    if (window.electronAPI?.onNavigate) {
      window.electronAPI.onNavigate((route) => navigateRef.current(route));
    }
  }, []); // [] = executa só uma vez, sem acumular listeners
  return null;
}

function FacebookBrowserWrapper() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFbRoute = location.pathname === '/facebook';

  return (
    <div style={{ display: isFbRoute ? 'block' : 'none', height: '100%', width: '100%' }}>
      <FacebookBrowser />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <WSProvider>
        <BrowserRouter>
          <ElectronNavigator />
          <div className="app-layout">
            <Sidebar />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/posts" element={<Posts />} />
                <Route path="/groups" element={<Groups />} />
                <Route path="/filters" element={<Filters />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/facebook" element={<div />} />
              </Routes>
              <FacebookBrowserWrapper />
            </main>
          </div>
        </BrowserRouter>
      </WSProvider>
    </ThemeProvider>
  );
}
