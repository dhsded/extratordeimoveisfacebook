import { NavLink } from 'react-router-dom';
import { useWS } from '../context/WSContext';
import { useTheme } from '../context/ThemeContext';

const NAV_ITEMS = [
  { to: '/',        icon: '📊', label: 'Dashboard', end: true },
  { to: '/posts',   icon: '🏠', label: 'Imóveis' },
  { to: '/groups',  icon: '👥', label: 'Grupos' },
  { to: '/sessions',icon: '🔐', label: 'Sessões' },
];

export default function Sidebar() {
  const { connected } = useWS();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

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
        {/* Toggle Tema */}
        <button
          id="theme-toggle-btn"
          className="theme-toggle"
          onClick={toggleTheme}
          title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15 }}>{isDark ? '☀️' : '🌙'}</span>
            <span>{isDark ? 'Tema Claro' : 'Tema Escuro'}</span>
          </span>
          <div className={`toggle-switch ${isDark ? '' : 'on'}`}>
            <div className="toggle-knob" />
          </div>
        </button>

        {/* Status WebSocket */}
        <div className="ws-indicator">
          <div className={`ws-dot ${connected ? 'connected' : 'disconnected'}`} />
          <span>{connected ? 'Conectado ao servidor' : 'Sem conexão'}</span>
        </div>
      </div>
    </aside>
  );
}
