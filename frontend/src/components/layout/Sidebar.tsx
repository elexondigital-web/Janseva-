import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { AdminRole } from '../../types';
import {
  IconLogo,
  IconHome,
  IconUsers,
  IconBuilding,
  IconSearch,
  IconCreditCard,
  IconActivity,
  IconMessageSquare,
  IconBarChart,
  IconShield,
  IconX,
} from '../ui/Icon';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** Role gate — only roles in this list see the link. Undefined = everyone. */
  roles?: AdminRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <IconHome size={16} /> },
  { to: '/people', label: 'Members', icon: <IconUsers size={16} /> },
  { to: '/search', label: 'Search', icon: <IconSearch size={16} /> },
  { to: '/id-cards', label: 'ID Cards', icon: <IconCreditCard size={16} /> },
  { to: '/attendance', label: 'Attendance', icon: <IconActivity size={16} /> },
  { to: '/messaging', label: 'Messaging', icon: <IconMessageSquare size={16} /> },
  {
    to: '/admins',
    label: 'Admins',
    icon: <IconShield size={16} />,
    roles: [AdminRole.SUPER_ADMIN, AdminRole.BLOCK_ADMIN],
  },
  { to: '/reports', label: 'Reports', icon: <IconBarChart size={16} /> },
  { to: '/hierarchy', label: 'Hierarchy', icon: <IconBuilding size={16} /> },
];

export default function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const role = useAuthStore((s) => s.user?.role);
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (role && item.roles.includes(role)),
  );
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/40"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-60 bg-navy text-white flex flex-col
          transition-transform lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="px-5 py-5 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
              <IconLogo size={18} />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-sm">JanSeva</div>
              <div className="text-[10px] text-text-muted font-mono tracking-wider mt-0.5">
                CONSTITUENCY MGMT
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden text-text-muted hover:text-white"
            aria-label="Close menu"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wider text-text-muted px-3 pb-1.5">
            Main
          </div>
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/20 text-white'
                    : 'text-text-muted hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span className="shrink-0">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 text-[10px] text-text-muted">
          &copy; {new Date().getFullYear()} JanSeva &middot; v1.0
        </div>
      </aside>
    </>
  );
}
