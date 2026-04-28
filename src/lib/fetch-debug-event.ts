/**
 * Debug script: fetch a specific event by id directly from relays. Used
 * during local triage; not wired into the app's runtime path.
 */

import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import { verifyEvent } from 'nostr-tools/pure';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);

async function fetchEvent() {
  const pool = new SimplePool();
  const relays = ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://relay.primal.net'];
  const id = 'cb7de79bd8e7b7b5ca31323a8d497b3f008c171e0fd7305c6bafc5b3d717e51a';

  console.log('Fetching event:', id);

  const events = await pool.querySync(relays, { ids: [id], limit: 1 }, { maxWait: 8000 });
  const verified = events.filter(verifyEvent);
  const event = verified[0];

  if (event) {
    console.log('Event found!');
    console.log('Pubkey:', event.pubkey);
    console.log('Kind:', event.kind);
    console.log('Content:', event.content);
    console.log('Tags:', event.tags);
  } else {
    console.log('Event not found.');
  }

  pool.close(relays);
}

fetchEvent().catch(console.error);
