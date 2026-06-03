import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { IconHome, IconLogo } from '../components/ui/Icon';

export default function NotFound() {
  useEffect(() => {
    document.title = 'JanSeva — Page not found';
  }, []);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 rounded bg-primary text-white flex items-center justify-center mx-auto">
          <IconLogo size={28} />
        </div>
        <div className="mt-6 text-7xl font-bold text-navy tracking-tight">
          404
        </div>
        <h1 className="text-lg font-bold text-navy mt-2">Page not found</h1>
        <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
          The page you are looking for doesn't exist or has been moved. Let's
          get you back to familiar ground.
        </p>
        <div className="mt-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark"
          >
            <IconHome size={14} /> Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
