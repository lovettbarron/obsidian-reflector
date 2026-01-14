import { ItemView, WorkspaceLeaf, MarkdownView, setIcon, TFile } from "obsidian";
import type ReflectorPlugin from "../main";
import type { MeetingNote, RelatedTodoItem } from "../types";

export const VIEW_TYPE_REFLECTOR = "reflector-view";

const DAILY_NOTE_REGEX = /^\d{4}-\d{2}-\d{2}\.md$/;

export class ReflectorView extends ItemView {
	plugin: ReflectorPlugin;
	private currentNote: MeetingNote | null = null;
	private currentFile: TFile | null = null;
	private currentLine: number = -1;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ReflectorPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_REFLECTOR;
	}

	getDisplayText(): string {
		return "Reflector";
	}

	getIcon(): string {
		return "glasses";
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async onClose(): Promise<void> {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
	}

	async onCursorChange(): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.file) {
			if (this.currentFile !== null || this.currentNote !== null) {
				this.currentFile = null;
				this.currentNote = null;
				this.currentLine = -1;
				await this.render();
			}
			return;
		}

		const file = activeView.file;
		const cursor = activeView.editor.getCursor();
		const line = cursor.line;

		// Check if anything changed
		const fileChanged = file.path !== this.currentFile?.path;
		const lineChanged = line !== this.currentLine;

		if (!fileChanged && !lineChanged) {
			return; // Nothing changed, skip update
		}

		this.currentFile = file;
		this.currentLine = line;

		// Get meeting note at cursor
		const note = await this.plugin.parser.getMeetingNoteAtCursor(file, line);

		const noteChanged =
			note?.file.path !== this.currentNote?.file.path ||
			note?.lineStart !== this.currentNote?.lineStart;

		if (fileChanged || noteChanged) {
			this.currentNote = note;
			await this.render();
		}
	}

	async refresh(): Promise<void> {
		this.currentNote = null;
		this.currentFile = null;
		this.currentLine = -1;
		await this.onCursorChange();
	}

	private async render(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("reflector-container");

		// Check if we're in a daily note
		const isDailyNote = this.currentFile && DAILY_NOTE_REGEX.test(this.currentFile.name);

		// If in daily note, show meeting notes in this file
		if (isDailyNote && this.currentFile) {
			await this.renderDailyNoteMeetingsSection(container);
		}

		// Current Note Context (when cursor is in a meeting note)
		if (this.currentNote) {
			await this.renderCurrentNoteSection(container);
			await this.renderRelatedNotesSection(container);
			await this.renderTodosSection(container);
			await this.renderTagSuggestionsSection(container);
		}

		// Untagged Notes Section (always show at bottom)
		await this.renderUntaggedSection(container);
	}

	private async renderDailyNoteMeetingsSection(container: HTMLElement): Promise<void> {
		if (!this.currentFile) return;

		const meetings = await this.plugin.parser.parseDailyNote(this.currentFile);

		if (meetings.length === 0) {
			return; // No meetings in this file
		}

		const section = container.createDiv({ cls: "reflector-section" });
		this.renderSectionHeader(section, "calendar", "Today's Meetings", meetings.length);

		const content = section.createDiv({ cls: "reflector-cards" });
		for (const note of meetings) {
			const isActive = this.currentNote?.lineStart === note.lineStart;
			const card = content.createDiv({
				cls: `reflector-card reflector-card-clickable ${isActive ? "reflector-card-active" : ""}`,
			});
			card.createDiv({ text: note.heading, cls: "reflector-card-title" });

			if (note.tags.length > 0) {
				const tagsDiv = card.createDiv({ cls: "reflector-card-tags" });
				for (const tag of note.tags.slice(0, 3)) {
					tagsDiv.createSpan({ text: tag, cls: "reflector-tag reflector-tag-small" });
				}
			} else {
				card.createDiv({ text: "No tags", cls: "reflector-card-empty" });
			}

			card.addEventListener("click", () => this.navigateToNote(note));
		}
	}

	private async renderUntaggedSection(container: HTMLElement): Promise<void> {
		const untagged = await this.plugin.parser.getUntaggedMeetingNotes();

		// If all tagged, show subtle success state
		if (untagged.length === 0) {
			const successDiv = container.createDiv({ cls: "reflector-success" });
			setIcon(successDiv.createSpan({ cls: "reflector-success-icon" }), "check-circle");
			successDiv.createSpan({ text: "All notes tagged", cls: "reflector-success-text" });
			return;
		}

		const section = container.createDiv({ cls: "reflector-section" });
		this.renderSectionHeader(section, "alert-circle", "Untagged Notes", untagged.length);

		const content = section.createDiv({ cls: "reflector-cards" });
		for (const note of untagged.slice(0, 10)) {
			const card = content.createDiv({ cls: "reflector-card reflector-card-clickable" });
			card.createDiv({ text: note.heading, cls: "reflector-card-title" });
			card.createDiv({ text: note.date, cls: "reflector-card-meta" });
			card.addEventListener("click", () => this.navigateToNote(note));
		}

		if (untagged.length > 10) {
			section.createDiv({
				text: `+ ${untagged.length - 10} more`,
				cls: "reflector-overflow",
			});
		}
	}

	private async renderCurrentNoteSection(container: HTMLElement): Promise<void> {
		if (!this.currentNote) return;

		const section = container.createDiv({ cls: "reflector-section reflector-current-section" });
		this.renderSectionHeader(section, "file-text", "Current Note");

		const card = section.createDiv({ cls: "reflector-card reflector-card-current" });
		card.createDiv({ text: this.currentNote.heading, cls: "reflector-card-title" });
		card.createDiv({ text: this.currentNote.date, cls: "reflector-card-meta" });

		if (this.currentNote.tags.length > 0) {
			const tagsDiv = card.createDiv({ cls: "reflector-card-tags" });
			for (const tag of this.currentNote.tags) {
				tagsDiv.createSpan({ text: tag, cls: "reflector-tag" });
			}
		} else {
			card.createDiv({ text: "No tags", cls: "reflector-card-empty" });
		}
	}

	private async renderRelatedNotesSection(container: HTMLElement): Promise<void> {
		if (!this.currentNote) return;

		const related = await this.plugin.parser.getRelatedMeetingNotes(this.currentNote);

		if (related.length === 0 && this.currentNote.tags.length === 0) {
			return; // Don't show empty section if no tags
		}

		const section = container.createDiv({ cls: "reflector-section" });
		this.renderSectionHeader(section, "link", "Related Notes", related.length || undefined);

		if (related.length === 0) {
			section.createDiv({
				text: "No related notes found",
				cls: "reflector-empty",
			});
			return;
		}

		const content = section.createDiv({ cls: "reflector-cards" });
		for (const note of related.slice(0, 8)) {
			const card = content.createDiv({ cls: "reflector-card reflector-card-clickable" });
			card.createDiv({ text: note.heading, cls: "reflector-card-title" });
			card.createDiv({ text: note.date, cls: "reflector-card-meta" });

			// Show shared tags as context
			const sharedTags = note.tags.filter((t) => this.currentNote!.tags.includes(t));
			if (sharedTags.length > 0) {
				const tagsDiv = card.createDiv({ cls: "reflector-card-tags" });
				for (const tag of sharedTags.slice(0, 3)) {
					tagsDiv.createSpan({ text: tag, cls: "reflector-tag reflector-tag-small" });
				}
			}

			card.addEventListener("click", () => this.navigateToNote(note));
		}
	}

	private async renderTodosSection(container: HTMLElement): Promise<void> {
		if (!this.currentNote) return;

		const todos = await this.plugin.todoService.getTodosForMeetingNote(this.currentNote);

		if (todos.length === 0) {
			return; // Don't show empty TODO section
		}

		const section = container.createDiv({ cls: "reflector-section" });
		this.renderSectionHeader(section, "check-square", "Related TODOs", todos.length);

		const content = section.createDiv({ cls: "reflector-todos" });
		for (const todo of todos.slice(0, 8)) {
			const item = content.createDiv({ cls: "reflector-todo" });

			const checkbox = item.createDiv({ cls: "reflector-todo-checkbox" });
			setIcon(checkbox, "square");

			const textDiv = item.createDiv({ cls: "reflector-todo-content" });
			textDiv.createDiv({ text: todo.text, cls: "reflector-todo-text" });

			// Context line with source and reason
			const contextDiv = textDiv.createDiv({ cls: "reflector-todo-context" });
			contextDiv.createSpan({ text: todo.file.basename, cls: "reflector-todo-source" });

			if (todo.matchingTags.length > 0) {
				contextDiv.createSpan({ text: " via ", cls: "reflector-todo-via" });
				for (const tag of todo.matchingTags.slice(0, 2)) {
					contextDiv.createSpan({ text: tag, cls: "reflector-tag reflector-tag-tiny" });
				}
			} else if (todo.relationReason === "linked") {
				contextDiv.createSpan({ text: " (linked)", cls: "reflector-todo-via" });
			}

			item.addEventListener("click", () => this.navigateToTodo(todo));
		}
	}

	private async renderTagSuggestionsSection(container: HTMLElement): Promise<void> {
		if (!this.currentNote) return;

		const suggestions = this.plugin.tagService.suggestTags(this.currentNote);

		if (suggestions.length === 0) {
			return; // Don't show empty suggestions
		}

		const section = container.createDiv({ cls: "reflector-section" });
		this.renderSectionHeader(section, "sparkles", "Suggested Tags");

		const content = section.createDiv({ cls: "reflector-suggestions" });
		for (const suggestion of suggestions.slice(0, 5)) {
			const item = content.createDiv({ cls: "reflector-suggestion" });
			item.createSpan({ text: suggestion.tag, cls: "reflector-tag" });
			item.createSpan({ text: suggestion.reason, cls: "reflector-suggestion-reason" });
		}
	}

	private renderSectionHeader(
		section: HTMLElement,
		icon: string,
		title: string,
		count?: number
	): void {
		const header = section.createDiv({ cls: "reflector-header" });
		setIcon(header.createSpan({ cls: "reflector-header-icon" }), icon);
		header.createSpan({ text: title, cls: "reflector-header-title" });
		if (count !== undefined) {
			header.createSpan({ text: String(count), cls: "reflector-header-count" });
		}
	}

	private async navigateToNote(note: MeetingNote): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(note.file);

		const view = leaf.view;
		if (view instanceof MarkdownView) {
			view.editor.setCursor({ line: note.lineStart, ch: 0 });
			view.editor.scrollIntoView(
				{ from: { line: note.lineStart, ch: 0 }, to: { line: note.lineStart, ch: 0 } },
				true
			);
		}
	}

	private async navigateToTodo(todo: RelatedTodoItem): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(todo.file);

		const view = leaf.view;
		if (view instanceof MarkdownView) {
			view.editor.setCursor({ line: todo.line, ch: 0 });
			view.editor.scrollIntoView(
				{ from: { line: todo.line, ch: 0 }, to: { line: todo.line, ch: 0 } },
				true
			);
		}
	}
}
