import { NavLink } from 'react-router-dom';
import { useWS } from '../context/WSContext';
import {
  LayoutDashboard, Building2, Table2, Wifi, WifiOff, Users
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: '📊', label: 'Dashboard', end: true },
  { to: '/posts', icon: '🏠', label: 'Imóveis' },
  { to: '/groups', icon: '👥', label: 'Grupos' },
  { to: '/sessions', icon: '🔐', label: 'Sessões' },
];

export default function Sidebar() {
  const { connected } = useWS();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🏠</div>
        <div className="sidebar-logo-text">
          <h1>Extrator</h1>
          <span>Imóveis FB</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Menu</div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="ws-indicator">
          <div className={`ws-dot ${connected ? 'connected' : 'disconnected'}`} />
          <span>{connected ? 'Conectado ao servidor' : 'Sem conexão'}</span>
        </div>
      </div>
    </aside>
  );
}
