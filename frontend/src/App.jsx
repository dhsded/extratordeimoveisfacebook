import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { WSProvider } from './context/WSContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Posts from './pages/Posts';
import Groups from './pages/Groups';
import Sessions from './pages/Sessions';
import { useEffect } from 'react';

// Listener para navegação via tray do Electron
function ElectronNavigator() {
  const navigate = useNavigate();
  useEffect(() => {
    if (window.electronAPI?.onNavigate) {
      window.electronAPI.onNavigate((route) => navigate(route));
    }
  }, [navigate]);
  return null;
}

export default function App() {
  return (
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
              <Route path="/sessions" element={<Sessions />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </WSProvider>
  );
}
