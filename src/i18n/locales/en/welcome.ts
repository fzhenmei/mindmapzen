import type { Dict } from '../../en'

// Welcome pane (v2.5 vertical axis): time-of-day greeting, relative time
// words, empty hint and footer (structure mirrors zh-CN)
const welcome: Dict['welcome'] = {
  greetingNight: 'Good night',
  greetingMorning: 'Good morning',
  greetingAfternoon: 'Good afternoon',
  greetingEvening: 'Good evening',
  today: 'Today',
  yesterday: 'Yesterday',
  recentTitle: 'Recent',
  emptyHint: 'No maps opened yet — create one above to get started.',
  footer: 'Setting out on the pilgrimage matters more than arriving at Vulture Peak.',
  greetingSuffix: '— Turn ideas into .md',
  newMap: 'New map',
  importMap: 'Import',
}
export default welcome
