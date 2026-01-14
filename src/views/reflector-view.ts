import { ItemView, WorkspaceLeaf, MarkdownView, setIcon } from "obsidian";
import type ReflectorPlugin from "../main";
import type { MeetingNote, TagSuggestion, TodoItem } from "../types";

export const VIEW_TYPE_REFLECTOR = "reflector-view";

export class ReflectorView extends ItemView {
	plugin: ReflectorPlugin;
	private currentNote: MeetingNote | null = null;
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

	/**
	 * Called when cursor position or active file changes
	 */
	async onCursorChange(): Promise<void> {
		// Debounce rapid cursor movements
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(async () => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView?.file) {
				this.currentNote = null;
				await this.render();
				return;
			}

			const cursor = activeView.editor.getCursor();
			const note = await this.plugin.parser.getMeetingNoteAtCursor(
				activeView.file,
				cursor.line
			);

			// Only re-render if note changed
			if (
				note?.file.path !== this.currentNote?.file.path ||
				note?.lineStart !== this.currentNote?.lineStart
			) {
				this.currentNote = note;
				await this.render();
			}
		}, 150);
	}

	/**
	 * Force a full refresh
	 */
	async refresh(): Promise<void> {
		this.currentNote = null;
		await this.onCursorChange();
	}

	private async render(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("reflector-view-container");

		// Untagged Notes Section
		await this.renderUntaggedSection(container);

		// Current Note Context (if we have one)
		if (this.currentNote) {
			await this.renderCurrentNoteSection(container);
			await this.renderRelatedNotesSection(container);
			await this.renderTagSuggestionsSection(container);
			await this.renderTodosSection(container);
		}
	}

	private async renderUntaggedSection(container: HTMLElement): Promise<void> {
		const section = container.createDiv({ cls: "reflector-section" });
		const header = section.createDiv({ cls: "reflector-section-header" });
		setIcon(header.createSpan({ cls: "reflector-section-icon" }), "alert-circle");
		header.createSpan({ text: "Untagged Notes", cls: "reflector-section-title" });

		const content = section.createDiv({ cls: "reflector-section-content" });

		const untagged = await this.plugin.parser.getUntaggedMeetingNotes();

		if (untagged.length === 0) {
			content.createDiv({
				text: "All meeting notes are tagged!",
				cls: "reflector-empty-message",
			});
			return;
		}

		const list = content.createEl("ul", { cls: "reflector-list" });
		for (const note of untagged.slice(0, 20)) {
			const item = list.createEl("li", { cls: "reflector-list-item" });
			const link = item.createEl("a", {
				text: `${note.date}: ${note.heading}`,
				cls: "reflector-link",
			});
			link.addEventListener("click", (e) => {
				e.preventDefault();
				this.navigateToNote(note);
			});
		}

		if (untagged.length > 20) {
			content.createDiv({
				text: `...and ${untagged.length - 20} more`,
				cls: "reflector-overflow-message",
			});
		}
	}

	private async renderCurrentNoteSection(container: HTMLElement): Promise<void> {
		if (!this.currentNote) return;

		const section = container.createDiv({ cls: "reflector-section reflector-current" });
		const header = section.createDiv({ cls: "reflector-section-header" });
		setIcon(header.createSpan({ cls: "reflector-section-icon" }), "file-text");
		header.createSpan({ text: "Current Note", cls: "reflector-section-title" });

		const content = section.createDiv({ cls: "reflector-section-content" });
		content.createDiv({
			text: this.currentNote.heading,
			cls: "reflector-current-heading",
		});
		content.createDiv({
			text: this.currentNote.date,
			cls: "reflector-current-date",
		});

		if (this.currentNote.tags.length > 0) {
			const tagsDiv = content.createDiv({ cls: "reflector-tags" });
			for (const tag of this.currentNote.tags) {
				tagsDiv.createSpan({ text: tag, cls: "reflector-tag" });
			}
		}
	}

	private async renderRelatedNotesSection(container: HTMLElement): Promise<void> {
		if (!this.currentNote) return;

		const section = container.createDiv({ cls: "reflector-section" });
		const header = section.createDiv({ cls: "reflector-section-header" });
		setIcon(header.createSpan({ cls: "reflector-section-icon" }), "link");
		header.createSpan({ text: "Related Notes", cls: "reflector-section-title" });

		const content = section.createDiv({ cls: "reflector-section-content" });

		const related = await this.plugin.parser.getRelatedMeetingNotes(
			this.currentNote
		);

		if (related.length === 0) {
			content.createDiv({
				text: this.currentNote.tags.length === 0
					? "Add tags to find related notes"
					: "No related notes found",
				cls: "reflector-empty-message",
			});
			return;
		}

		const list = content.createEl("ul", { cls: "reflector-list" });
		for (const note of related.slice(0, 15)) {
			const item = list.createEl("li", { cls: "reflector-list-item" });
			const link = item.createEl("a", {
				text: `${note.date}: ${note.heading}`,
				cls: "reflector-link",
			});
			link.addEventListener("click", (e) => {
				e.preventDefault();
				this.navigateToNote(note);
			});

			// Show shared tags
			const sharedTags = note.tags.filter((t) =>
				this.currentNote!.tags.includes(t)
			);
			if (sharedTags.length > 0) {
				const tagsSpan = item.createSpan({ cls: "reflector-inline-tags" });
				tagsSpan.setText(sharedTags.join(" "));
			}
		}
	}

	private async renderTagSuggestionsSection(
		container: HTMLElement
	): Promise<void> {
		if (!this.currentNote) return;

		const section = container.createDiv({ cls: "reflector-section" });
		const header = section.createDiv({ cls: "reflector-section-header" });
		setIcon(header.createSpan({ cls: "reflector-section-icon" }), "tag");
		header.createSpan({ text: "Suggested Tags", cls: "reflector-section-title" });

		const content = section.createDiv({ cls: "reflector-section-content" });

		const suggestions = this.plugin.tagService.suggestTags(this.currentNote);

		if (suggestions.length === 0) {
			content.createDiv({
				text: "No tag suggestions",
				cls: "reflector-empty-message",
			});
			return;
		}

		const list = content.createEl("ul", { cls: "reflector-list" });
		for (const suggestion of suggestions.slice(0, 5)) {
			const item = list.createEl("li", { cls: "reflector-list-item" });
			item.createSpan({ text: suggestion.tag, cls: "reflector-suggested-tag" });
			item.createSpan({
				text: ` - ${suggestion.reason}`,
				cls: "reflector-tag-reason",
			});
		}
	}

	private async renderTodosSection(container: HTMLElement): Promise<void> {
		if (!this.currentNote) return;

		const section = container.createDiv({ cls: "reflector-section" });
		const header = section.createDiv({ cls: "reflector-section-header" });
		setIcon(header.createSpan({ cls: "reflector-section-icon" }), "check-square");
		header.createSpan({ text: "Related TODOs", cls: "reflector-section-title" });

		const content = section.createDiv({ cls: "reflector-section-content" });

		const todos = await this.plugin.todoService.getTodosForMeetingNote(
			this.currentNote
		);

		if (todos.length === 0) {
			content.createDiv({
				text: "No related TODOs",
				cls: "reflector-empty-message",
			});
			return;
		}

		const list = content.createEl("ul", { cls: "reflector-list" });
		for (const todo of todos.slice(0, 10)) {
			const item = list.createEl("li", { cls: "reflector-list-item reflector-todo-item" });
			const link = item.createEl("a", {
				cls: "reflector-link",
			});
			link.createSpan({ text: todo.text, cls: "reflector-todo-text" });
			link.createSpan({
				text: ` (${todo.file.basename}${todo.heading ? ` -> ${todo.heading}` : ""})`,
				cls: "reflector-todo-source",
			});
			link.addEventListener("click", (e) => {
				e.preventDefault();
				this.navigateToTodo(todo);
			});
		}

		if (todos.length > 10) {
			content.createDiv({
				text: `...and ${todos.length - 10} more`,
				cls: "reflector-overflow-message",
			});
		}
	}

	private async navigateToNote(note: MeetingNote): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(note.file);

		// Navigate to the specific line
		const view = leaf.view;
		if (view instanceof MarkdownView) {
			view.editor.setCursor({ line: note.lineStart, ch: 0 });
			view.editor.scrollIntoView(
				{ from: { line: note.lineStart, ch: 0 }, to: { line: note.lineStart, ch: 0 } },
				true
			);
		}
	}

	private async navigateToTodo(todo: TodoItem): Promise<void> {
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
