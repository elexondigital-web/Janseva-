import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../api/auth.api';
import {
  IconMenu,
  IconUser,
  IconLogOut,
  IconChevronDown,
} from '../ui/Icon';

interface TopBarProps {
  onOpenMobile: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  BLOCK_ADMIN: 'Block Admin',
  WARD_ADMIN: 'Ward Admin',
  BOOTH_WORKER: 'Booth Worker',
};

export default function TopBar({ onOpenMobile }: TopBarProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpen]);

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {
      // ignore: revoke fails are non-blocking
    }
    logout();
    toast.success('Signed out');
    navigate('/login');
  }

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((s) => s.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-border h-14 flex items-center justify-between px-4 lg:px-6">
      <button
        type="button"
        onClick={onOpenMobile}
        className="lg:hidden text-text-secondary hover:text-navy"
        aria-label="Open menu"
      >
        <IconMenu size={20} />
      </button>

      <div className="flex-1 lg:pl-0 pl-4">
        <div className="text-[11px] text-text-muted uppercase tracking-wider">
          {ROLE_LABEL[user.role] ?? user.role}
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded hover:bg-surface transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-primary-bg text-primary font-semibold text-xs flex items-center justify-center">
            {initials || <IconUser size={14} />}
          </div>
          <div className="hidden md:block text-left leading-tight">
            <div className="text-xs font-semibold text-navy">{user.name}</div>
            <div className="text-[10px] text-text-muted">{user.email}</div>
          </div>
          <IconChevronDown size={12} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-1.5 w-56 bg-white border border-border rounded shadow-elevated overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <div className="text-sm font-semibold text-navy truncate">
                {user.name}
              </div>
              <div className="text-xs text-text-muted truncate">{user.email}</div>
              <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mt-1.5">
                {ROLE_LABEL[user.role] ?? user.role}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-status-red hover:bg-status-red-bg transition-colors"
            >
              <IconLogOut size={14} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
