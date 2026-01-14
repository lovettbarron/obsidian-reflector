# Obsidian Reflector

A plugin for [Obsidian](https://obsidian.md) that helps you review and manage meeting notes within your daily notes.

## Why Reflector?

If you use daily notes to capture meeting notes throughout your day, you may find yourself with dozens of unorganized notes scattered across files. Reflector helps you:

- **Find untagged meeting notes** so nothing gets lost without proper categorization
- **Discover related notes** by surfacing other meetings that share tags with your current focus
- **Track connected TODOs** from across your vault that relate to your current meeting
- **Get tag suggestions** based on the content of your notes

## How It Works

Reflector treats **meeting notes** as first-class objects. A meeting note is defined as an H3 section (`### Meeting Title`) that lives under a configurable H2 header (default: `## Notes`) within your daily notes.

```markdown
# 2024-01-15

## Notes

### Project Alpha Standup #project-alpha #standup
- Discussed timeline changes
- [ ] Follow up with design team

### 1:1 with Manager
- Career growth conversation
- No tags yet - will appear in "Untagged Notes"
```

## Features

### Sidebar Panel
The Reflector sidebar shows contextual information based on your current file and cursor position:

- **Today's Meetings** - When viewing a daily note, see all meeting notes in that file. Click to navigate.
- **Current Note** - Shows the meeting note your cursor is in, with its tags
- **Related Notes** - Other meeting notes (from any daily note) that share tags
- **Related TODOs** - Incomplete tasks from files that share tags or link to this note
- **Suggested Tags** - Tag recommendations based on keywords in your meeting title and content
- **Untagged Notes** - Meeting notes missing hashtags, so you can organize them

### Automatic Updates
The sidebar updates automatically as you:
- Switch between files
- Move your cursor between meeting notes
- Add or remove tags

## Installation

### From Obsidian Community Plugins
1. Open **Settings → Community plugins**
2. Search for "Reflector"
3. Click **Install**, then **Enable**

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/lovettbarron/obsidian-reflector/releases)
2. Create folder: `<vault>/.obsidian/plugins/obsidian-reflector/`
3. Copy the downloaded files into that folder
4. Reload Obsidian and enable the plugin in **Settings → Community plugins**

## Configuration

In **Settings → Reflector**:

| Setting | Default | Description |
|---------|---------|-------------|
| Daily notes folder | `_daily` | Folder containing your daily notes |
| Meeting notes header | `## Notes` | H2 header under which meeting notes (H3) are found |

## Daily Note Format

For Reflector to find your meeting notes, your daily notes should:
- Be named `YYYY-MM-DD.md` (e.g., `2024-01-15.md`)
- Live in the configured daily notes folder
- Have meeting notes as H3 headers under the configured H2 header

## Development

```bash
npm install        # Install dependencies
npm run dev        # Development build with watch
npm run build      # Production build
npm run lint       # Run ESLint
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

Built with [Claude Code](https://claude.ai/code) as an experiment in AI-assisted plugin development.
