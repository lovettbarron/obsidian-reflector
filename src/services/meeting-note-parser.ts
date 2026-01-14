import { App, TFile } from "obsidian";
import type { MeetingNote } from "../types";
import type { ReflectorSettings } from "../settings";

const DAILY_NOTE_REGEX = /^\d{4}-\d{2}-\d{2}\.md$/;
const TAG_REGEX = /#[\w/-]+/g;

export class MeetingNoteParser {
	constructor(
		private app: App,
		private settings: ReflectorSettings
	) {}

	/**
	 * Get all daily note files from the configured folder
	 */
	getDailyNoteFiles(): TFile[] {
		const folder = this.app.vault.getAbstractFileByPath(
			this.settings.dailyNotesFolder
		);
		if (!folder || !("children" in folder)) {
			return [];
		}

		return (folder.children as TFile[]).filter(
			(file) => file instanceof TFile && DAILY_NOTE_REGEX.test(file.name)
		);
	}

	/**
	 * Parse a single daily note file and extract all meeting notes
	 */
	async parseDailyNote(file: TFile): Promise<MeetingNote[]> {
		const content = await this.app.vault.cachedRead(file);
		const lines = content.split("\n");
		const meetingNotes: MeetingNote[] = [];

		// Extract date from filename (YYYY-MM-DD.md -> YYYY-MM-DD)
		const date = file.basename;

		// Find the meeting notes header (H2)
		const headerLine = this.settings.meetingNotesHeader.trim();
		let inNotesSection = false;
		let currentNote: Partial<MeetingNote> | null = null;
		let currentContent: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			const trimmedLine = line.trim();

			// Check for the Notes H2 header
			if (trimmedLine === headerLine) {
				inNotesSection = true;
				continue;
			}

			// Check if we've exited the Notes section (another H2)
			if (inNotesSection && trimmedLine.startsWith("## ") && trimmedLine !== headerLine) {
				// Save current note if exists
				if (currentNote?.heading) {
					meetingNotes.push(
						this.finalizeMeetingNote(currentNote, currentContent, file, date, i)
					);
				}
				inNotesSection = false;
				currentNote = null;
				currentContent = [];
				continue;
			}

			if (!inNotesSection) continue;

			// Check for H3 header (new meeting note)
			if (trimmedLine.startsWith("### ")) {
				// Save previous note if exists
				if (currentNote?.heading) {
					meetingNotes.push(
						this.finalizeMeetingNote(currentNote, currentContent, file, date, i)
					);
				}

				// Start new note
				currentNote = {
					heading: trimmedLine.slice(4).trim(),
					lineStart: i,
				};
				currentContent = [];
			} else if (currentNote) {
				// Add content to current note
				currentContent.push(line);
			}
		}

		// Don't forget the last note
		if (currentNote?.heading) {
			meetingNotes.push(
				this.finalizeMeetingNote(currentNote, currentContent, file, date, lines.length)
			);
		}

		return meetingNotes;
	}

	private finalizeMeetingNote(
		partial: Partial<MeetingNote>,
		contentLines: string[],
		file: TFile,
		date: string,
		lineEnd: number
	): MeetingNote {
		const content = contentLines.join("\n");
		const fullText = `${partial.heading}\n${content}`;
		const tags = this.extractTags(fullText);

		return {
			file,
			heading: partial.heading!,
			lineStart: partial.lineStart!,
			lineEnd,
			tags,
			content,
			date,
		};
	}

	private extractTags(text: string): string[] {
		const matches = text.match(TAG_REGEX);
		return matches ? [...new Set(matches)] : [];
	}

	/**
	 * Get all meeting notes from all daily notes
	 */
	async getAllMeetingNotes(): Promise<MeetingNote[]> {
		const files = this.getDailyNoteFiles();
		const allNotes: MeetingNote[] = [];

		for (const file of files) {
			const notes = await this.parseDailyNote(file);
			allNotes.push(...notes);
		}

		// Sort by date descending (most recent first)
		return allNotes.sort((a, b) => b.date.localeCompare(a.date));
	}

	/**
	 * Get all meeting notes that have no tags
	 */
	async getUntaggedMeetingNotes(): Promise<MeetingNote[]> {
		const allNotes = await this.getAllMeetingNotes();
		return allNotes.filter((note) => note.tags.length === 0);
	}

	/**
	 * Get the meeting note at the current cursor position
	 */
	async getMeetingNoteAtCursor(
		file: TFile,
		cursorLine: number
	): Promise<MeetingNote | null> {
		// Only process daily notes
		if (!DAILY_NOTE_REGEX.test(file.name)) {
			return null;
		}

		const notes = await this.parseDailyNote(file);

		// Find the note that contains the cursor
		for (const note of notes) {
			if (cursorLine >= note.lineStart && cursorLine < note.lineEnd) {
				return note;
			}
		}

		return null;
	}

	/**
	 * Get meeting notes that share tags with the given note
	 */
	async getRelatedMeetingNotes(note: MeetingNote): Promise<MeetingNote[]> {
		if (note.tags.length === 0) {
			return [];
		}

		const allNotes = await this.getAllMeetingNotes();
		const tagSet = new Set(note.tags);

		return allNotes
			.filter((other) => {
				// Don't include the same note
				if (
					other.file.path === note.file.path &&
					other.lineStart === note.lineStart
				) {
					return false;
				}
				// Check for shared tags
				return other.tags.some((tag) => tagSet.has(tag));
			})
			.sort((a, b) => {
				// Sort by number of shared tags (descending), then by date
				const aShared = a.tags.filter((t) => tagSet.has(t)).length;
				const bShared = b.tags.filter((t) => tagSet.has(t)).length;
				if (bShared !== aShared) return bShared - aShared;
				return b.date.localeCompare(a.date);
			});
	}
}
