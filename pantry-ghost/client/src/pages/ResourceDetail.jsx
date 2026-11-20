import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Pencil, Trash2, ArrowRight, Copy } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useMeta } from '../context/MetaContext';
import { usePermission } from '../hooks/usePermission';
import { getRecord, updateRecord, deleteRecord, recordActivity } from '../api/resources';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ResourceForm, duplicateValues } from '../components/resource/ResourceForm';
import { CommentsCard } from '../components/resource/CommentsCard';
import { ChecklistChecks } from '../components/resource/ChecklistField';
import { StatusBadge } from '../components/resource/StatusBadge';
import { ActivityTimeline } from '../components/resource/ActivityTimeline';
import { EmptyCrypt } from '../components/spooky';
import { displayValue, formatDateTime, recordTitle } from '../lib/format';
import { errorMessage, humanise } from '../lib/utils';
import { RecordQrCard } from '../components/qr/RecordQrCard';
import qrCodes from '../qrCodes';

const isDeletedRecord = (resource, item) => !!resource.softDelete && item[resource.softDelete.field] === resource.softDelete.value;

// App detail panels: client/src/detail/<resourceKey>.jsx receives { record, resource } (Req 16.13).
const detailPanels = import.meta.glob('../detail/*.jsx', { eager: true });
const detailPanelFor = (key) => detailPanels[`../detail/${key}.jsx`]?.default ?? null;

/** Detail page: fields, status transitions, edit/delete by permission, activity (Req 13.5). */
export default function ResourceDetail() {
  const { key, id } = useParams();
  const api = useApi();
  const meta = useMeta();
  const { can } = usePermission();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const resource = meta.resource(key);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const record = useQuery({ queryKey: ['r', key, id], queryFn: () => getRecord(api, key, id), enabled: !!resource });
  const activity = useQuery({ queryKey: ['activity', key, id], queryFn: () => recordActivity(api, key, id), enabled: !!resource });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['r', key] });
    qc.invalidateQueries({ queryKey: ['activity', key, id] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const transition = useMutation({
    mutationFn: (to) => updateRecord(api, key, id, { [resource.statusFlow.field]: to }),
    onSuccess: (item) => { refresh(); toast.success(`Moved to ${humanise(item[resource.statusFlow.field])}`); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Ticking a checklist item PATCHes the whole array; the cache is updated first and rolled back on error.
  const checklist = useMutation({
    mutationFn: ({ name, value }) => updateRecord(api, key, id, { [name]: value }),
    onMutate: async ({ name, value }) => {
      await qc.cancelQueries({ queryKey: ['r', key, id] });
      const previous = qc.getQueryData(['r', key, id]);
      qc.setQueryData(['r', key, id], (old) => (old ? { ...old, [name]: value } : old));
      return { previous };
    },
    onError: (err, _vars, ctx) => { if (ctx?.previous) qc.setQueryData(['r', key, id], ctx.previous); toast.error(errorMessage(err)); },
    onSettled: () => refresh(),
  });

  const remove = useMutation({
    mutationFn: () => deleteRecord(api, key, id),
    onSuccess: () => { refresh(); toast.success(resource.softDelete ? 'Laid to rest (archived)' : 'Deleted'); navigate(`/r/${key}`); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (meta.loading || record.isLoading) {
    return <div className="flex flex-col gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!resource || record.isError) {
    return <EmptyCrypt title="This record has vanished">It may have been deleted, or you may not have access.</EmptyCrypt>;
  }

  const item = record.data;
  const DetailPanel = detailPanelFor(key);
  // QR code for physical items (client/src/qrCodes.js); none for archived records.
  const qr = !isDeletedRecord(resource, item) && qrCodes[key] ? qrCodes[key].target(item) : null;
  const titleField = resource.titleField ?? resource.fields[0]?.name;
  const statusField = resource.statusFlow?.field ?? resource.due?.status ?? resource.softDelete?.field;
  const current = statusField ? item[statusField] : null;
  const isDeleted = resource.softDelete && current === resource.softDelete.value;
  const nextStates = resource.statusFlow?.transitions?.[current] ?? [];
  const canUpdate = can(key, 'update');
  const canDelete = can(key, 'delete') && !isDeleted;
  const canCreate = can(key, 'create');

  const save = async (body) => {
    try {
      await updateRecord(api, key, id, body);
      refresh();
      setEditing(false);
      toast.success('Changes saved');
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  return (
    <div>
      <Link to={`/r/${key}`} className="mb-2 inline-flex items-center gap-1 py-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {resource.label}
      </Link>
      <PageHeader
        title={recordTitle(resource, item)}
        description={<span className="flex flex-wrap items-center gap-2">{current && <StatusBadge value={current} resource={resource} />}<span>Created {formatDateTime(item.createdAt)}{item.createdBy?.name ? ` by ${item.createdBy.name}` : ''}</span></span>}
        actions={
          <>
            {canUpdate && !isDeleted && <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden /> Edit</Button>}
            {canCreate && <Button variant="outline" onClick={() => navigate(`/r/${key}/new`, { state: { prefill: duplicateValues(resource, item) } })}><Copy className="h-4 w-4" aria-hidden /> Duplicate</Button>}
            {canDelete && <Button variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" aria-hidden /> {resource.softDelete ? 'Archive' : 'Delete'}</Button>}
          </>
        }
      />

      {canUpdate && nextStates.length > 0 && (
        <Card className="mb-4 flex flex-wrap items-center gap-2 p-4">
          <span className="mr-1 text-sm text-muted-foreground">Move to</span>
          {nextStates.map((s) => (
            <Button key={s} variant="secondary" size="sm" disabled={transition.isPending} onClick={() => transition.mutate(s)}>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden /> {humanise(s)}
            </Button>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {resource.fields.map((f) => (
                <div key={f.name} className={f.type === 'text' || f.type === 'checklist' ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {f.name === statusField ? <StatusBadge value={item[f.name]} resource={resource} /> : f.type === 'checklist' ? (
                      <ChecklistChecks label={f.label} value={item[f.name]} onChange={canUpdate && !isDeleted ? (value) => checklist.mutate({ name: f.name, value }) : undefined} />
                    ) : displayValue(f, item[f.name])}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        {resource.comments !== false && <CommentsCard resourceKey={key} recordId={id} />}
        {DetailPanel && <DetailPanel record={item} resource={resource} />}
        </div>
        <div className="flex flex-col gap-4">
          {qr && <RecordQrCard path={qr.path} caption={qr.caption} title={recordTitle(resource, item)} appName={meta.appName} />}
          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent>{activity.isLoading ? <Skeleton className="h-32 w-full" /> : <ActivityTimeline items={activity.data} />}</CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit {recordTitle(resource, item)}</DialogTitle>
            <DialogDescription>Status changes use the “Move to” buttons.</DialogDescription>
          </DialogHeader>
          <ResourceForm resource={resource} initial={item} onSubmit={save} onCancel={() => setEditing(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resource.softDelete ? 'Archive this record?' : 'Delete this record?'}</DialogTitle>
            <DialogDescription>
              {resource.softDelete
                ? `It will be marked ${humanise(resource.softDelete.value)} and hidden from lists. Its history is kept.`
                : 'This permanently removes it. Its history entry is kept.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>{resource.softDelete ? 'Archive' : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
