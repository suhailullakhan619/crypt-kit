import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { UserPlus, Users as UsersIcon } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useMeta } from '../context/MetaContext';
import { listUsers, createUser, updateUser } from '../api/users';
import { PageHeader } from '../components/layout/AppShell';
import { Card, Skeleton, Table, THead, TBody, TR, TH, TD, Badge } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { Select, Switch } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { errorMessage } from '../lib/utils';

function NewUserDialog({ open, onOpenChange, roles }) {
  const api = useApi();
  const qc = useQueryClient();
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { role: roles[roles.length - 1] } });

  const submit = handleSubmit(async (values) => {
    try {
      await createUser(api, values);
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(`${values.name} has joined the coven`);
      reset();
      onOpenChange(false);
    } catch (err) {
      const fields = err?.response?.data?.fields;
      if (fields) Object.entries(fields).forEach(([k, m]) => setError(k, { message: m }));
      toast.error(errorMessage(err));
    }
  });

  const field = (name, label, props = {}) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`nu-${name}`}>{label}</Label>
      <Input id={`nu-${name}`} aria-invalid={!!errors[name]} {...props} {...register(name, { required: `${label} is required` })} />
      {errors[name] && <p role="alert" className="text-xs text-destructive">{errors[name].message}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>Share the password with them securely; they can sign in right away.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {field('name', 'Name', { autoComplete: 'off' })}
          {field('email', 'Email', { type: 'email', autoComplete: 'off' })}
          {field('password', 'Temporary password', { type: 'password', autoComplete: 'new-password', minLength: 8 })}
          <div className="flex flex-col gap-2">
            <Label htmlFor="nu-role">Role</Label>
            <Select id="nu-role" {...register('role')}>{roles.map((r) => <option key={r}>{r}</option>)}</Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Create user</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Superuser user management (Req 3.8): list, create, change role, deactivate. */
export default function Users() {
  const api = useApi();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const { roles } = useMeta();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => listUsers(api, { limit: 100 }) });

  const update = useMutation({
    mutationFn: ({ id, body }) => updateUser(api, id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Who can enter, and what each role may do."
        icon={<UsersIcon className="h-6 w-6 text-primary" />}
        actions={<Button onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" aria-hidden /> Invite user</Button>}
      />
      <Card>
        {isLoading ? (
          <div className="flex flex-col gap-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>Name</TH><TH className="hidden sm:table-cell">Email</TH><TH>Role</TH><TH>Active</TH></TR></THead>
            <TBody>
              {data.items.map((u) => {
                const self = u._id === me?.userId;
                return (
                  <TR key={u._id}>
                    <TD className="font-medium">
                      {u.name} {self && <Badge variant="muted">you</Badge>}
                      <div className="text-xs font-normal text-muted-foreground sm:hidden">{u.email}</div>
                    </TD>
                    <TD className="hidden text-muted-foreground sm:table-cell">{u.email}</TD>
                    <TD className="w-40">
                      <Select aria-label={`Role for ${u.name}`} value={u.role} disabled={self || update.isPending}
                        onChange={(e) => update.mutate({ id: u._id, body: { role: e.target.value } })}>
                        {roles.map((r) => <option key={r}>{r}</option>)}
                      </Select>
                    </TD>
                    <TD>
                      <Switch aria-label={`${u.active ? 'Deactivate' : 'Activate'} ${u.name}`} checked={u.active} disabled={self || update.isPending}
                        onCheckedChange={(v) => update.mutate({ id: u._id, body: { active: v } })} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      {roles.length > 0 && <NewUserDialog open={open} onOpenChange={setOpen} roles={roles} />}
    </div>
  );
}
