import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-6xl font-black text-brand-200">404</p>
      <h1 className="text-2xl font-bold text-slate-800">Page not found</h1>
      <p className="max-w-md text-sm text-slate-500">The page you are looking for does not exist or was moved.</p>
      <Link to="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
    </div>
  );
}