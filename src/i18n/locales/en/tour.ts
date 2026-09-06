import type { Dict } from '../../en'

// Guided tour (spec §4.1): sample map name + overlay buttons + 10 step
// title/body pairs (structure mirrors zh-CN)
const tour: Dict['tour'] = {
  sampleMapName: 'Tour sample',
  overlay: {
    skip: 'Skip',
    prev: 'Back',
    next: 'Next',
    done: 'Done',
  },
  steps: {
    welcome: {
      title: 'Welcome to Mind Map Zen',
      body: 'A local-first mind mapping tool — a 1-minute tour of the essentials. You can Skip anytime and replay it later from Settings.',
    },
    newMap: {
      title: 'New map',
      body: 'Enter a name and pick a template to create a map. Double-click any map on the desk to jump back into editing.',
    },
    import: {
      title: 'Import existing content',
      body: 'Import a Markdown outline or an XMind file and it turns into a map directly.',
    },
    dirs: {
      title: 'Organize with folders',
      body: 'The folder tree on the left manages the maps and folders in your workspace — click a file to preview it, double-click to edit it.',
    },
    toEditor: {
      title: 'Into the editor',
      body: 'Next, a look at the editor. We will open a “Tour sample” map as the demo; it stays in the workspace after the tour, so feel free to practice on it.',
    },
    zenbar: {
      title: 'Command bar',
      body: 'The command bar at the bottom gathers common actions — back to desk, switch map, copy Markdown, save and more; hover to see shortcuts.',
    },
    layout: {
      title: 'Switch layout',
      body: 'One click for the common layouts: Mind map, Logic diagram and Org chart; Timeline and Fishbone live under “More layouts”.',
    },
    body: {
      title: 'Node body',
      body: 'Select a node and write its body text in the panel on the right — plain Markdown syntax, saved with the map file.',
    },
    export: {
      title: 'Export as image',
      body: 'Export the map as PNG/SVG in one click, or copy it straight to the clipboard.',
    },
    finish: {
      title: 'Start your first map',
      body: 'The “Tour sample” map is still in the workspace — practice on it freely. Now go create a map of your own!',
    },
  },
}
export default tour
