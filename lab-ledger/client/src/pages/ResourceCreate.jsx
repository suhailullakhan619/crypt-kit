import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useApi } from '../hooks/useApi';
import { useMeta } from '../context/MetaContext';
import { usePermission } from '../hooks/usePermission';
import { createRecord } from '../api/resources';
import { PageHeader } from '../components/layout/AppShell';
import { Card, Skeleton } from '../components/ui/display';
import { ResourceForm } from '../components/resource/ResourceForm';
import { ResourceIcon } from '../components/spooky';
import { errorMessage } from '../lib/utils';
import NotFound from './NotFound';

/** Create page (Req 13.4, 13.7). */
export default function ResourceCreate() {
  const { key } = useParams();
  const api = useApi();
  const meta = useMeta();
  const { can } = usePermission();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const resource = meta.resource(key);

  if (meta.loading) return <Skeleton className="h-64 w-full" />;
  if (!resource) return <NotFound />;
  if (!can(key, 'create')) return <Navigate to={`/r/${key}`} replace />;

  const onSubmit = async (body) => {
    try {
      const item = await createRecord(api, key, body);
      qc.invalidateQueries({ queryKey: ['r', key] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Record summoned ✨');
      navigate(`/r/${key}/${item._id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon={<ResourceIcon name={resource.icon} className="h-6 w-6 text-primary" />} title={`New ${resource.label.replace(/s$/, '').toLowerCase()}`} />
      <Card className="p-5 md:p-6">
        <ResourceForm resource={resource} prefill={location.state?.prefill} onSubmit={onSubmit} submitLabel="Create" onCancel={() => navigate(-1)} />
      </Card>
    </div>
  );
}
