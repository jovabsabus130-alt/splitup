import { useState } from 'react';
import { Link } from 'react-router-dom';
import AIFloatingButton from './AIFloatingButton';
import AppSidebar from './AppSidebar';

export default function AppLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-layout">
      {/* ── Mobile Top Header Bar ────────────────────────────────────────── */}
      <div className="mobile-top-bar">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Open Navigation Menu"
        >
          ☰
        </button>
        <Link to="/dashboard" className="mobile-brand">
          <div className="brand-badge">S</div>
          <span className="brand-title">SplitUp</span>
        </Link>
      </div>

      {/* ── Persistent Sidebar / Mobile Slide-out Drawer ─────────────────── */}
      <AppSidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* ── Mobile Overlay Backdrop ──────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main Scrollable Area ─────────────────────────────────────────── */}
      <main className="app-main-content">
        <div className="app-main-container">
          {children}
        </div>
      </main>

      {/* ── Globally Floating AI Assistant Button ────────────────────────── */}
      <AIFloatingButton />
    </div>
  );
}
