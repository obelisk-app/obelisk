
import NDK from '@nostr-dev-kit/ndk';

async function fetchEvent() {
  const ndk = new NDK({
    explicitRelayUrls: ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://relay.primal.net']
  });
  await ndk.connect();
  
  const id = 'cb7de79bd8e7b7b5ca31323a8d497b3f008c171e0fd7305c6bafc5b3d717e51a';
  console.log('Fetching event:', id);
  
  const event = await ndk.fetchEvent(id);
  if (event) {
    console.log('Event found!');
    console.log('Pubkey:', event.pubkey);
    console.log('Kind:', event.kind);
    console.log('Content:', event.content);
    console.log('Tags:', event.tags);
  } else {
    console.log('Event not found.');
  }
}

fetchEvent().catch(console.error);
