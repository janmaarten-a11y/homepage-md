/**
 * HomepageMD — Client-side enhancements.
 *
 * v0.1: SSE live-update listener
 * v0.2: Search filtering, keyboard navigation (planned)
 * v0.3: Add/edit bookmark form (planned)
 */

const evtSource = new EventSource('/api/events');

evtSource.addEventListener('message', (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'update') {
      window.location.reload();
    }
  } catch {
    // Ignore malformed events
  }
});
