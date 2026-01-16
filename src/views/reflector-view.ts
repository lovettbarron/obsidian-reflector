import { ItemView, WorkspaceLeaf, MarkdownView, setIcon, TFile, Editor } from "obsidian";
import type ReflectorPlugin from "../main";
import type { MeetingNote, RelatedTodoItem, TagSuggestion } from "../types";

interface TodoCounts {
	total: number;
	completed: number;
}

export const VIEW_TYPE_REFLECTOR = "reflector-view";

const DAILY_NOTE_REGEX = /^\d{4}-\d{2}-\d{2}\.md$/;

export class ReflectorView extends ItemView {
	plugin: ReflectorPlugin;

	// Tracked editor state - set via file-open event, NOT polling
	private trackedFile: TFile | null = null;
	private trackedEditor: Editor | null = null;

	// Derived state from cursor position
	private currentNote: MeetingNote | null = null;
	private currentLine: number = -1;

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
		// Clean up tracked state
		this.trackedFile = null;
		this.trackedEditor = null;
	}

	/**
	 * Called when a file is opened in the editor.
	 * This sets up tracking for the new file/editor pair.
	 */
	onFileOpen(file: TFile | null, editor: Editor | null): void {
		console.debug("[Reflector] onFileOpen", {
			file: file?.path,
			hasEditor: !!editor,
			previousFile: this.trackedFile?.path,
		});

		if (!file || !editor) {
			// No file open - clear tracking
			this.trackedFile = null;
			this.trackedEditor = null;
			this.currentNote = null;
			this.currentLine = -1;
			void this.render();
			return;
		}

		// Update tracked editor/file
		this.trackedFile = file;
		this.trackedEditor = editor;

		// Check cursor position in the new file
		void this.checkCursorPosition();
	}

	/**
	 * Called periodically to check if the cursor has moved within the tracked editor.
	 * This does NOT re-query which editor is active - it only checks cursor position
	 * in the already-tracked editor.
	 */
	async checkCursorPosition(): Promise<void> {
		// If no tracked editor, nothing to check
		if (!this.trackedFile || !this.trackedEditor) {
			return;
		}

		const cursor = this.trackedEditor.getCursor();
		const line = cursor.line;

		// Check if cursor line changed
		if (line === this.currentLine) {
			return; // No change
		}

		console.debug("[Reflector] checkCursorPosition: Line changed", {
			file: this.trackedFile.path,
			oldLine: this.currentLine,
			newLine: line,
		});

		this.currentLine = line;

		// Get meeting note at cursor
		const note = await this.plugin.parser.getMeetingNoteAtCursor(this.trackedFile, line);

		const noteChanged =
			note?.file.path !== this.currentNote?.file.path ||
			note?.lineStart !== this.currentNote?.lineStart;

		if (noteChanged) {
			console.debug("[Reflector] Updating currentNote", {
				newNote: note?.heading,
				oldNote: this.currentNote?.heading,
			});
			this.currentNote = note;
			await this.render();
		}
	}

	/**
	 * @deprecated Use onFileOpen and checkCursorPosition instead
	 */
	async onCursorChange(): Promise<void> {
		// Legacy method - now delegates to checkCursorPosition
		// The file tracking is handled by onFileOpen called from main.ts
		await this.checkCursorPosition();
	}

	async refresh(): Promise<void> {
		// Reset cursor tracking but keep the file/editor reference
		this.currentNote = null;
		this.currentLine = -1;
		await this.checkCursorPosition();
	}

	private async render(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("reflector-container");

		// Check if we're in a daily note
		const isDailyNote = this.trackedFile && DAILY_NOTE_REGEX.test(this.trackedFile.name);

		// If in daily note, show meeting notes in this file
		if (isDailyNote && this.trackedFile) {
			await this.renderDailyNoteMeetingsSection(container);
		}

		// Context sections (when cursor is in a meeting note)
		if (this.currentNote) {
			await this.renderRelatedNotesSection(container);
			await this.renderTodosSection(container);
			await this.renderTagSuggestionsSection(container);
		}

		// Untagged Notes Section (always show at bottom)
		await this.renderUntaggedSection(container);
	}

	private async renderDailyNoteMeetingsSection(container: HTMLElement): Promise<void> {
		if (!this.trackedFile) return;

		const meetings = await this.plugin.parser.parseDailyNote(this.trackedFile);

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

			// Show TODO counts
			const todoCounts = this.countTodos(note.content);
			if (todoCounts.total > 0) {
				const todoText = todoCounts.completed === todoCounts.total
					? `${todoCounts.total} Todo${todoCounts.total > 1 ? "s" : ""}, All Complete`
					: `${todoCounts.total} Todo${todoCounts.total > 1 ? "s" : ""}, ${todoCounts.completed} Complete`;
				card.createDiv({ text: todoText, cls: "reflector-card-meta" });
			}

			if (note.tags.length > 0) {
				const tagsDiv = card.createDiv({ cls: "reflector-card-tags" });
				for (const tag of note.tags.slice(0, 3)) {
					tagsDiv.createSpan({ text: tag, cls: "reflector-tag reflector-tag-small" });
				}
			} else {
				card.createDiv({ text: "No tags", cls: "reflector-card-empty" });
			}

			card.addEventListener("click", () => {
				console.debug("[Reflector] TODAY'S MEETINGS card clicked", { heading: note.heading });
				void this.navigateToNote(note);
			});
		}
	}

	private countTodos(content: string): TodoCounts {
		const incompleteMatches = content.match(/- \[ \]/g);
		const completeMatches = content.match(/- \[x\]/gi);
		const incomplete = incompleteMatches ? incompleteMatches.length : 0;
		const completed = completeMatches ? completeMatches.length : 0;
		return {
			total: incomplete + completed,
			completed,
		};
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
			card.addEventListener("click", () => {
				console.debug("[Reflector] UNTAGGED card clicked", { heading: note.heading });
				void this.navigateToNote(note);
			});
		}

		if (untagged.length > 10) {
			section.createDiv({
				text: `+ ${untagged.length - 10} more`,
				cls: "reflector-overflow",
			});
		}
	}

	private async renderRelatedNotesSection(container: HTMLElement): Promise<void> {
		if (!this.currentNote) return;

		const section = container.createDiv({ cls: "reflector-section" });

		// If no tags, show message to add tags
		if (this.currentNote.tags.length === 0) {
			this.renderSectionHeader(section, "link", "Related Notes");
			section.createDiv({
				text: "Add tags to find related notes",
				cls: "reflector-empty",
			});
			return;
		}

		const related = await this.plugin.parser.getRelatedMeetingNotes(this.currentNote);
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

			card.addEventListener("click", () => {
				console.debug("[Reflector] RELATED NOTE card clicked", { heading: note.heading });
				void this.navigateToNote(note);
			});
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

			item.addEventListener("click", () => {
				console.debug("[Reflector] TODO item clicked", { text: todo.text });
				void this.navigateToTodo(todo);
			});
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
			const item = content.createDiv({ cls: "reflector-suggestion reflector-suggestion-clickable" });
			item.createSpan({ text: suggestion.tag, cls: "reflector-tag" });
			item.createSpan({ text: suggestion.reason, cls: "reflector-suggestion-reason" });
			item.addEventListener("click", () => {
				console.debug("[Reflector] SUGGESTED TAG clicked", { tag: suggestion.tag });
				void this.addTagToCurrentNote(suggestion);
			});
		}
	}

	private async addTagToCurrentNote(suggestion: TagSuggestion): Promise<void> {
		console.debug("[Reflector] addTagToCurrentNote called", {
			tag: suggestion.tag,
			currentNote: this.currentNote?.heading,
			trackedFile: this.trackedFile?.path,
		});

		// Capture the note reference immediately (before any async operations)
		const note = this.currentNote;
		if (!note) {
			console.debug("[Reflector] ERROR: currentNote is null, cannot add tag");
			return;
		}

		// Find the markdown leaf with this file
		const leaf = this.findMarkdownLeaf(note.file);
		if (!leaf || !(leaf.view instanceof MarkdownView)) {
			console.debug("[Reflector] ERROR: Could not find markdown leaf", {
				leafFound: !!leaf,
				isMarkdownView: leaf?.view instanceof MarkdownView,
			});
			return;
		}

		const view = leaf.view;
		const editor = view.editor;

		// Save current cursor position
		const savedCursor = editor.getCursor();
		console.debug("[Reflector] Saved cursor position", savedCursor);

		// Read the file content
		const content = await this.app.vault.read(note.file);
		const lines = content.split("\n");

		// Insert tag on the line below the H3 heading
		const insertLine = note.lineStart + 1;
		const currentLineContent = lines[insertLine] ?? "";

		console.debug("[Reflector] Inserting tag", {
			insertLine,
			currentLineContent,
			tag: suggestion.tag,
		});

		// If the line already has content, append the tag with a space
		// Otherwise, just add the tag
		let newLineContent: string;
		if (currentLineContent.trim() === "") {
			newLineContent = suggestion.tag;
		} else {
			newLineContent = currentLineContent + " " + suggestion.tag;
		}

		// Update the line
		lines[insertLine] = newLineContent;
		const newContent = lines.join("\n");

		// Write the file
		console.debug("[Reflector] Writing modified content to file");
		await this.app.vault.modify(note.file, newContent);

		// Focus back on the editor and restore cursor position
		console.debug("[Reflector] Focusing leaf and restoring cursor");
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		setTimeout(() => {
			editor.setCursor(savedCursor);
			console.debug("[Reflector] Cursor restored");
		}, 50);
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

	/**
	 * Find the first line of actual content in a meeting note (after H3 and tags)
	 */
	private findContentStartLine(note: MeetingNote): number {
		const lines = note.content.split("\n");
		let contentLine = note.lineStart + 1; // Start after H3

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]?.trim() ?? "";
			// Skip empty lines and lines that are just tags
			if (line === "" || /^#[\w/-]+(\s+#[\w/-]+)*$/.test(line)) {
				contentLine = note.lineStart + 1 + i + 1;
				continue;
			}
			break;
		}

		return contentLine;
	}

	/**
	 * Find a markdown leaf, preferring one with the target file open
	 */
	private findMarkdownLeaf(targetFile?: TFile): WorkspaceLeaf | null {
		const leaves = this.app.workspace.getLeavesOfType("markdown");

		console.debug("[Reflector] findMarkdownLeaf called", {
			targetFile: targetFile?.path,
			leavesCount: leaves.length,
			leafTypes: leaves.map((l) => ({
				type: l.view?.getViewType(),
				file: l.view instanceof MarkdownView ? l.view.file?.path : null,
			})),
		});

		// First, try to find a leaf with the target file
		if (targetFile) {
			for (const leaf of leaves) {
				if (leaf.view instanceof MarkdownView && leaf.view.file?.path === targetFile.path) {
					console.debug("[Reflector] Found leaf with target file");
					return leaf;
				}
			}
		}

		// Otherwise return the first markdown leaf
		const result = leaves[0] ?? null;
		console.debug("[Reflector] Returning first leaf", { found: !!result });
		return result;
	}

	private async navigateToNote(note: MeetingNote): Promise<void> {
		console.debug("[Reflector] navigateToNote called", {
			noteHeading: note.heading,
			noteFile: note.file.path,
			noteLineStart: note.lineStart,
		});

		// Find the content start line (below H3 and tags)
		const targetLine = this.findContentStartLine(note);
		console.debug("[Reflector] Target line calculated", { targetLine });

		// Try to find an existing markdown leaf with this file
		let leaf = this.findMarkdownLeaf(note.file);

		const fileAlreadyOpen = leaf && leaf.view instanceof MarkdownView && leaf.view.file?.path === note.file.path;
		console.debug("[Reflector] File already open?", { fileAlreadyOpen });

		if (fileAlreadyOpen && leaf && leaf.view instanceof MarkdownView) {
			// File is already open, just navigate
			console.debug("[Reflector] Setting active leaf and cursor (file already open)");
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
			const editor = leaf.view.editor;
			editor.setCursor({ line: targetLine, ch: 0 });
			editor.scrollIntoView(
				{ from: { line: note.lineStart, ch: 0 }, to: { line: targetLine, ch: 0 } },
				true
			);
			console.debug("[Reflector] Navigation complete (same file)");
		} else {
			// Need to open the file - get or create a markdown leaf
			console.debug("[Reflector] Opening file in new/existing leaf");
			leaf = this.findMarkdownLeaf() ?? this.app.workspace.getLeaf("tab");
			await leaf.openFile(note.file);
			this.app.workspace.setActiveLeaf(leaf, { focus: true });

			// Wait for the view to be ready
			setTimeout(() => {
				console.debug("[Reflector] setTimeout callback - setting cursor");
				if (leaf && leaf.view instanceof MarkdownView) {
					const editor = leaf.view.editor;
					editor.setCursor({ line: targetLine, ch: 0 });
					editor.scrollIntoView(
						{ from: { line: note.lineStart, ch: 0 }, to: { line: targetLine, ch: 0 } },
						true
					);
					console.debug("[Reflector] Navigation complete (opened file)");
				} else {
					console.debug("[Reflector] ERROR: Leaf view is not MarkdownView after openFile");
				}
			}, 50);
		}
	}

	private async navigateToTodo(todo: RelatedTodoItem): Promise<void> {
		let leaf = this.findMarkdownLeaf(todo.file);

		if (leaf && leaf.view instanceof MarkdownView && leaf.view.file?.path === todo.file.path) {
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
			const editor = leaf.view.editor;
			editor.setCursor({ line: todo.line, ch: 0 });
			editor.scrollIntoView(
				{ from: { line: todo.line, ch: 0 }, to: { line: todo.line, ch: 0 } },
				true
			);
		} else {
			leaf = this.findMarkdownLeaf() ?? this.app.workspace.getLeaf("tab");
			await leaf.openFile(todo.file);
			this.app.workspace.setActiveLeaf(leaf, { focus: true });

			setTimeout(() => {
				if (leaf && leaf.view instanceof MarkdownView) {
					const editor = leaf.view.editor;
					editor.setCursor({ line: todo.line, ch: 0 });
					editor.scrollIntoView(
						{ from: { line: todo.line, ch: 0 }, to: { line: todo.line, ch: 0 } },
						true
					);
				}
			}, 50);
		}
	}
}
