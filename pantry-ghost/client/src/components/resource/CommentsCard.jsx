import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { listComments, addComment, deleteComment } from '../../api/comments';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '../ui/display';
import { Button } from '../ui/button';
import { Textarea, Label } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { formatDateTime, timeAgo } from '../../lib/format';
import { errorMessage } from '../../lib/utils';

/**
 * Comments on a record. Bodies are plain text (React escapes them; line breaks are kept by CSS).
 *
 * @param {{ resourceKey: string, recordId: string, onChanged?: () => void }} props
 */
export function CommentsCard({ resourceKey, recordId, onChanged }) {
  const api = useApi();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const queryKey = ['comments', resourceKey, recordId];
  const comments = useQuery({ queryKey, queryFn: () => listComments(api, resourceKey, recordId) });

  const settled = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ['activity', resourceKey, recordId] });
    onChanged?.();
  };

  const post = useMutation({
    mutationFn: (text) => addComment(api, resourceKey, recordId, text),
    onSuccess: () => { setBody(''); settled(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id) => deleteComment(api, resourceKey, recordId, id),
    onSuccess: () => { setToDelete(null); settled(); toast.success('Comment deleted'); },
    onError: (err) => { setToDelete(null); toast.error(errorMessage(err)); },
  });

  const text = body.trim();
  const submit = () => { if (text && !post.isPending) post.mutate(text); };
  const items = comments.data ?? [];

  return (
    <Card>
      <CardHeader><CardTitle>Comments{items.length ? ` (${items.length})` : ''}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {comments.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : comments.isError ? (
          <p role="alert" className="text-sm text-destructive">Comments could not be loaded.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((c) => (
              <li key={c._id} className="rounded-md border bg-background/50 p-3">
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.author?.name ?? 'Unknown'}</span>
                  {c.author?.role && <span>{c.author.role}</span>}
                  <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)}>{timeAgo(c.createdAt)}</time>
                  {c.canDelete && (
                    <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-destructive hover:bg-destructive/10" aria-label="Delete comment" onClick={() => setToDelete(c)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          <Label htmlFor="comment-body">Add a comment</Label>
          <Textarea
            id="comment-body"
            value={body}
            maxLength={2000}
            placeholder="Write a comment… (Ctrl+Enter to send)"
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!text || post.isPending}>{post.isPending ? 'Posting…' : 'Comment'}</Button>
          </div>
        </form>
      </CardContent>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this comment?</DialogTitle>
            <DialogDescription>This removes the comment for everyone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(toDelete._id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
