import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom doesn't implement scrollIntoView.
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = () => {};
}

// Fix Event mismatch in Node 22 + jsdom
// Undici (used by built-in fetch/websocket) expects the real Node Event, 
// but jsdom replaces it.
if (typeof window !== 'undefined') {
    // Save original jsdom Event if needed, but here we want to satisfy Undici
    const originalEvent = window.Event;
    
    // Check if we are in a Node environment that has these
    if ((global as any).Event) {
        (window as any).Event = (global as any).Event;
    }
    if ((global as any).MessageEvent) {
        (window as any).MessageEvent = (global as any).MessageEvent;
    }
    if ((global as any).CloseEvent) {
        (window as any).CloseEvent = (global as any).CloseEvent;
    }
    if ((global as any).ErrorEvent) {
        (window as any).ErrorEvent = (global as any).ErrorEvent;
    }
}
