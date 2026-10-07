import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { useToastStore } from '@/store/feedback/toast';
import ForwardMessageModal from '@/components/chat/message/ForwardMessageModal';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';

const group = (id: string, name: string) => ({ id, name } as unknown as JsGroup);
const groups = [group('from', 'origin'), group('a', 'general')];

function setup(sendMessage: (...args: unknown[]) => Promise<unknown>) {
  const bridge = fakeBridge({ groups }, { sendMessage } as never);
  registerBridge(bridge);
  const onClose = vi.fn();
  renderWithBridge(
    <ForwardMessageModal message={{ content: 'line 1\nline 2' } as JsMessage} authorName="Ana" fromGroupId="from" onClose={onClose} />,
    bridge,
  );
  return onClose;
}

describe('ForwardMessageModal forwarding', () => {
  afterEach(() => {
    unregisterBridge();
    useToastStore.setState({ toasts: [] } as never);
  });

  it('sends the quoted message to the picked channel, says so and closes', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const onClose = setup(sendMessage);
    fireEvent.click(screen.getByTestId('forward-target-a'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sendMessage).toHaveBeenCalledWith('a', '**Forwarded** #origin · Ana\n> line 1\n> line 2', undefined, undefined);
    expect(JSON.stringify(useToastStore.getState())).toContain('general');
  });

  it('a failed send says why and lets the person try again', async () => {
    const sendMessage = vi.fn(async () => { throw new Error('nope'); });
    const onClose = setup(sendMessage);
    fireEvent.click(screen.getByTestId('forward-target-a'));
    await waitFor(() => expect(JSON.stringify(useToastStore.getState())).toContain("Couldn't forward the message"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('forward-target-a')).toBeEnabled();
  });
});
