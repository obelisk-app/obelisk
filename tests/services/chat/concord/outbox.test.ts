import { beforeEach, expect, it, vi } from 'vitest';
import { ConcordOutbox } from '@/services/chat/concord/outbox';
import type { ConcordCommunity } from '@applesauce/concord/client';

const { upload } = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@/services/chat/concord/media', () => ({ concordUploader: () => ({ upload }) }));

function setup() {
  const publishToPlane = vi.fn().mockResolvedValue('id');
  const community = { pubkey: 'a'.repeat(64), communityId: 'community', material: { root_epoch: 0, channels: [] }, publishToPlane } as unknown as ConcordCommunity;
  return { box: new ConcordOutbox(community), publishToPlane, community };
}
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn().mockReturnValue('blob:local');
  URL.revokeObjectURL = vi.fn();
  upload.mockResolvedValue({ url: 'https://files.test/blob', type: 'image/png' });
});

it('shows a pending preview before upload, retains a failed file, and retries once', async () => {
  let reject!: (error: Error) => void;
  upload.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
  const { box, publishToPlane } = setup();
  box.enqueue('channel', '', null, [new File(['photo'], 'photo.png', { type: 'image/png' })]);
  const id = box.rows$.value[0].message.id;
  expect(box.rows$.value[0].message.pending).toBe(true);
  expect(box.rows$.value[0].previews).toEqual(['blob:local']);
  expect(publishToPlane).not.toHaveBeenCalled();
  reject(new Error('offline'));
  await vi.waitFor(() => expect(box.rows$.value[0].message.failed).toBe(true));
  box.retry(id); box.retry(id); box.retry(id); box.retry(id);
  await vi.waitFor(() => expect(box.rows$.value).toHaveLength(0));
  expect(upload).toHaveBeenCalledTimes(2);
  expect(publishToPlane).toHaveBeenCalledTimes(1);
  expect(publishToPlane.mock.calls[0][2]).toMatchObject({ requiredAckStage: 'message-send' });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
});

it('retries the exact rumor after relay failure without uploading the photo again', async () => {
  const { box, publishToPlane } = setup();
  publishToPlane.mockRejectedValueOnce(new Error('relay timeout'));
  box.enqueue('channel', 'photo', { id: 'b'.repeat(64), pubkey: 'c'.repeat(64) }, [new File(['photo'], 'photo.png')]);
  await vi.waitFor(() => expect(box.rows$.value[0].phase).toBe('failed'));
  const id = box.rows$.value[0].message.id;
  const prepared = publishToPlane.mock.calls[0][1];
  box.retry(id);
  await vi.waitFor(() => expect(box.rows$.value).toHaveLength(0));
  expect(upload).toHaveBeenCalledTimes(1);
  expect(publishToPlane.mock.calls[1][1]).toBe(prepared);
});

it('does not publish a pending upload after account disposal', async () => {
  let resolve!: (value: object) => void;
  upload.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  const { box, publishToPlane } = setup();
  box.enqueue('channel', '', null, [new File(['photo'], 'photo.png')]);
  box.dispose();
  resolve({ url: 'https://files.test/blob' });
  await new Promise(yes => setTimeout(yes, 0));
  expect(publishToPlane).not.toHaveBeenCalled();
  expect(box.rows$.value).toHaveLength(0);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
});
