import type { Dict } from '../../en'

// Mobile idea capture entries (spec 2026-09-26 mobile-capture §5.4): toast for batch-adding
// ideas relayed by the Rust mobile-sync service
const mobileSync: Dict['mobileSync'] = {
  received: 'Received {{n}} ideas from phone',
}

export default mobileSync
