import { useState, FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/auth.store';
import { AdminRole } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  IconLogo,
  IconShield,
  IconFingerprint,
  IconEye,
  IconEyeOff,
  IconMail,
  IconLock,
  IconUser,
  IconCheckCircle,
  IconUsers,
} from '../components/ui/Icon';

export default function Login() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setAuth = useAuthStore((s) => s.setAuth);
  usePageTitle('Sign in');

  const [email, setEmail] = useState('admin@janseva.in');
  const [password, setPassword] = useState('Admin@123');
  const [role, setRole] = useState<AdminRole | ''>('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const { accessToken, refreshToken, user } = await authApi.login({
        email: email.trim(),
        password,
        role: role || undefined,
      });
      setAuth(user, accessToken, refreshToken);
      toast.success(`Welcome, ${user.name}`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Invalid credentials';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFingerprint() {
    toast('Fingerprint scanner not connected in Phase 1', {
      icon: 'i',
      style: { background: '#eef0f3', color: '#23272F' },
    });
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      {/* LEFT — navy panel */}
      <div className="lg:w-[44%] bg-navy text-white flex flex-col relative overflow-hidden">
        <div className="px-10 pt-10 pb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-primary flex items-center justify-center">
            <IconLogo size={22} />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">JanSeva</div>
            <div className="text-[11px] text-text-muted font-mono tracking-wider mt-0.5">
              CONSTITUENCY MGMT
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center px-10 pb-12 max-w-xl">
          <div className="text-[11px] font-semibold tracking-wider text-primary-light uppercase mb-3">
            For Block &middot; Ward &middot; Booth administrators
          </div>
          <h1 className="text-3xl font-bold leading-tight mb-4 tracking-tight">
            Manage your constituency with clarity and control.
          </h1>
          <p className="text-text-muted text-[15px] leading-relaxed mb-10 max-w-md">
            One platform for your members, hierarchy, ID cards, attendance and
            outreach &mdash; built for political party operations in Punjab.
          </p>

          <div className="space-y-4">
            <FeatureRow
              icon={<IconUsers size={16} />}
              title="Member management"
              text="Store 10,000+ members with full profiles and documents."
            />
            <FeatureRow
              icon={<IconCheckCircle size={16} />}
              title="Event attendance"
              text="Mark presence via fingerprint, QR, or manual entry."
            />
            <FeatureRow
              icon={<IconShield size={16} />}
              title="Role-based access"
              text="Block, ward and booth admins see only their own branch."
            />
          </div>
        </div>

        <div className="px-10 pb-8 text-[11px] text-text-muted border-t border-white/5 pt-4">
          &copy; {new Date().getFullYear()} JanSeva &middot; v1.0 &middot; Punjab, India
        </div>

        {/* Subtle geometric accent */}
        <div className="absolute -bottom-40 -right-40 w-[380px] h-[380px] rounded-full bg-primary/10 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-[220px] h-[220px] rounded-full bg-primary-light/5 pointer-events-none" />
      </div>

      {/* RIGHT — form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-surface">
        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-navy mb-1.5 tracking-tight">
              Sign in to JanSeva
            </h2>
            <p className="text-text-secondary text-[14px]">
              Enter your credentials to access the admin panel.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-navy-light mb-1.5"
              >
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-text-muted">
                  <IconMail size={16} />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@janseva.in"
                  className="w-full border border-border rounded-sm bg-white pl-9 pr-3 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-navy-light mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-text-muted">
                  <IconLock size={16} />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full border border-border rounded-sm bg-white pl-9 pr-10 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-2 flex items-center px-1.5 text-text-muted hover:text-primary transition-colors"
                >
                  {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </div>

            {/* Role */}
            <div>
              <label
                htmlFor="role"
                className="block text-xs font-semibold text-navy-light mb-1.5"
              >
                Login as
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-text-muted">
                  <IconUser size={16} />
                </div>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as AdminRole | '')}
                  className="w-full border border-border rounded-sm bg-white pl-9 pr-8 py-2.5 text-[14px] text-text-primary appearance-none cursor-pointer"
                >
                  <option value="">Auto-detect from account</option>
                  <option value={AdminRole.SUPER_ADMIN}>Super Admin</option>
                  <option value={AdminRole.BLOCK_ADMIN}>Block Admin</option>
                  <option value={AdminRole.WARD_ADMIN}>Ward Admin</option>
                  <option value={AdminRole.BOOTH_WORKER}>Booth Worker</option>
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-text-muted">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[14px] py-2.5 rounded-sm transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.2-8.57" />
                  </svg>
                  Signing in&hellip;
                </>
              ) : (
                <>
                  <IconShield size={15} />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <div className="text-[11px] text-text-muted uppercase tracking-wider">
              or continue with biometric
            </div>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            type="button"
            onClick={handleFingerprint}
            className="w-full border border-border bg-white hover:border-primary hover:text-primary hover:bg-primary-bg text-text-secondary py-2.5 rounded-sm text-[14px] font-medium transition-colors flex items-center justify-center gap-2"
          >
            <IconFingerprint size={18} />
            Login with Fingerprint Scanner
          </button>

          <p className="text-[11.5px] text-text-muted mt-8 text-center">
            Need help signing in? Contact your block administrator.
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded bg-primary/20 text-primary-light flex items-center justify-center flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <div className="text-[13.5px] font-semibold text-white leading-snug">{title}</div>
        <div className="text-[12.5px] text-text-muted leading-snug mt-0.5">{text}</div>
      </div>
    </div>
  );
}
