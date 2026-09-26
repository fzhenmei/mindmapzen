import type { Dict } from '../../en'

// Mobile idea capture entries (spec 2026-09-26 mobile-capture §5.1/§5.4): settings section copy +
// toast for batch-adding ideas relayed by the Rust mobile-sync service
const mobileSync: Dict['mobileSync'] = {
  title: 'Phone Sync',
  toggle: 'Allow phones to sync ideas over the local network',
  port: 'Port',
  hint: 'Once on, a phone on the same network pairs by scanning the QR code; ideas land straight in the idea basket',
  qrcodeHint: 'Scan to pair (open in the browser and "Add to Home Screen")',
  ipSelect: 'This computer address',
  startFailed: 'Failed to start the service (port already in use?)',
  received: 'Received {{n}} ideas from phone',
}

export default mobileSync
