# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian Reflector is a community plugin for reviewing and managing meeting notes within daily notes. It provides:
- Identification of untagged meeting notes
- Tag suggestions based on note content
- Related notes discovery via shared tags
- Connected TODO tracking across the vault

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Development mode with watch
npm run build        # Production build (type-checks first)
npm run lint         # Run ESLint
```

## Architecture

### Core Concept: MeetingNote
A MeetingNote is an H3 section under the configured "Notes" header (default: `## Notes`) within a daily note file (format: `YYYY-MM-DD.md` in the `_daily` folder).

### File Structure
```
src/
  main.ts                         # Plugin lifecycle, view/command registration
  settings.ts                     # ReflectorSettings interface and settings tab
  types.ts                        # Core interfaces (MeetingNote, TodoItem, TagSuggestion)
  services/
    meeting-note-parser.ts        # Parse daily notes, extract MeetingNotes
    tag-service.ts                # Vault tag collection, tag suggestions
    todo-service.ts               # Find TODOs related to meeting notes
  views/
    reflector-view.ts             # Right sidebar ItemView
```

### Services

**MeetingNoteParser** (`services/meeting-note-parser.ts`)
- `getDailyNoteFiles()` - Get files from configured daily notes folder
- `parseDailyNote(file)` - Extract MeetingNotes from a file
- `getAllMeetingNotes()` - All meeting notes across all daily notes
- `getUntaggedMeetingNotes()` - Filter to notes without hashtags
- `getMeetingNoteAtCursor(file, line)` - Get note at cursor position
- `getRelatedMeetingNotes(note)` - Find notes sharing tags

**TagService** (`services/tag-service.ts`)
- `getAllVaultTags()` - Collect all tags from vault files
- `suggestTags(note)` - Suggest tags based on title/content keywords

**TodoService** (`services/todo-service.ts`)
- `getTodosForMeetingNote(note)` - Find related TODOs via shared tags or explicit links

### View

**ReflectorView** (`views/reflector-view.ts`)
- Extends `ItemView` for right sidebar display
- Sections: Untagged Notes, Current Note, Related Notes, Suggested Tags, Related TODOs
- Updates on cursor changes (debounced) and file modifications

## Key Patterns

### Daily Note Matching
Files must match pattern `YYYY-MM-DD.md` in the configured folder (default: `_daily`).

### Tag Extraction
Tags are hashtag-based (`#tag-name`), extracted via regex from meeting note content.

### TODO Matching
TODOs connect to meeting notes via:
1. Shared tags between the TODO's file and the meeting note
2. Explicit `[[daily-note]]` links or mentions of the meeting heading

## Settings

- `dailyNotesFolder`: Folder containing daily notes (default: `_daily`)
- `meetingNotesHeader`: H2 header under which meeting notes appear (default: `## Notes`)

## Testing

Manual testing: Copy `main.js`, `manifest.json`, `styles.css` to `<Vault>/.obsidian/plugins/obsidian-reflector/`, reload Obsidian, enable plugin.

Test scenarios:
1. Create daily note with `## Notes` and `### Meeting Name` sections
2. Open Reflector sidebar (ribbon icon or command palette)
3. Navigate to meeting notes and verify related content updates
