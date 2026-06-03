import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Hierarchy from './pages/Hierarchy';
import People from './pages/People';
import PersonForm from './pages/PersonForm';
import PersonDetail from './pages/PersonDetail';
import Search from './pages/Search';
import IdCards from './pages/IdCards';
import Attendance from './pages/Attendance';
import AttendanceReport from './pages/AttendanceReport';
import Messaging from './pages/Messaging';
import Reports from './pages/Reports';
import Admins from './pages/Admins';
import NotFound from './pages/NotFound';

// Protected route wrapper — requires auth + wraps children in Layout shell
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/people"
        element={
          <ProtectedRoute>
            <People />
          </ProtectedRoute>
        }
      />
      <Route
        path="/people/new"
        element={
          <ProtectedRoute>
            <PersonForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/people/:id"
        element={
          <ProtectedRoute>
            <PersonDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/people/:id/edit"
        element={
          <ProtectedRoute>
            <PersonForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <Search />
          </ProtectedRoute>
        }
      />
      <Route
        path="/id-cards"
        element={
          <ProtectedRoute>
            <IdCards />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <Attendance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/:eventId/report"
        element={
          <ProtectedRoute>
            <AttendanceReport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/messaging"
        element={
          <ProtectedRoute>
            <Messaging />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admins"
        element={
          <ProtectedRoute>
            <Admins />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hierarchy"
        element={
          <ProtectedRoute>
            <Hierarchy />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
