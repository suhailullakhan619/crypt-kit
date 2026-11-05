import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute, SuperuserOnly } from './components/layout/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ResourceList from './pages/ResourceList';
import ResourceCreate from './pages/ResourceCreate';
import ResourceDetail from './pages/ResourceDetail';
import Reports from './pages/Reports';
import VoiceAgent from './pages/VoiceAgent';
import Users from './pages/Users';
import NotFound from './pages/NotFound';
import appRoutes from './appRoutes';

/** Route table (design § Routing). App routes come from appRoutes.jsx. */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="r/:key" element={<ResourceList />} />
        <Route path="r/:key/new" element={<ResourceCreate />} />
        <Route path="r/:key/:id" element={<ResourceDetail />} />
        <Route path="reports" element={<Reports />} />
        <Route path="voice" element={<VoiceAgent />} />
        <Route path="users" element={<SuperuserOnly><Users /></SuperuserOnly>} />
        {appRoutes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
