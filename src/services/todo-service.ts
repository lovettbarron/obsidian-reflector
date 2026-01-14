import { App, TFile } from "obsidian";
import type { MeetingNote, TodoItem, RelatedTodoItem } from "../types";

const TODO_REGEX = /^[\s]*-\s*\[\s*\]\s*(.+)$/;
const TAG_REGEX = /#[\w/-]+/g;
const LINK_REGEX = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export class TodoService {
	constructor(private app: App) {}

	/**
	 * Get all incomplete TODO items from the vault
	 */
	async getAllTodos(): Promise<TodoItem[]> {
		const files = this.app.vault.getMarkdownFiles();
		const todos: TodoItem[] = [];

		for (const file of files) {
			const fileTodos = await this.getTodosFromFile(file);
			todos.push(...fileTodos);
		}

		return todos;
	}

	/**
	 * Extract TODO items from a single file
	 */
	private async getTodosFromFile(file: TFile): Promise<TodoItem[]> {
		const content = await this.app.vault.cachedRead(file);
		const lines = content.split("\n");
		const todos: TodoItem[] = [];

		let currentHeading: string | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			const trimmed = line.trim();

			// Track current heading
			if (trimmed.startsWith("#")) {
				const match = trimmed.match(/^#+\s+(.+)$/);
				if (match?.[1]) {
					currentHeading = match[1];
				}
			}

			// Check for incomplete TODO
			const todoMatch = line.match(TODO_REGEX);
			if (todoMatch?.[1]) {
				todos.push({
					text: todoMatch[1].trim(),
					file,
					heading: currentHeading,
					line: i,
				});
			}
		}

		return todos;
	}

	/**
	 * Get tags from a file
	 */
	private async getFileTags(file: TFile): Promise<string[]> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.tags) {
			return [];
		}
		return cache.tags.map((t) => t.tag);
	}

	/**
	 * Check if a TODO is related to a meeting note via explicit links
	 */
	private todoHasLinkToNote(todo: TodoItem, note: MeetingNote): boolean {
		// Check for [[daily-note]] link
		const dailyNoteBasename = note.file.basename;
		const links = todo.text.match(LINK_REGEX);

		if (links) {
			for (const link of links) {
				const linkMatch = link.match(LINK_REGEX);
				if (linkMatch) {
					// Reset regex
					LINK_REGEX.lastIndex = 0;
					const match = LINK_REGEX.exec(link);
					if (match && match[1]) {
						const linkTarget = match[1];
						if (
							linkTarget === dailyNoteBasename ||
							linkTarget.endsWith(`/${dailyNoteBasename}`)
						) {
							return true;
						}
					}
				}
			}
		}

		// Reset regex for reuse
		LINK_REGEX.lastIndex = 0;

		// Check if TODO mentions the meeting heading
		const headingLower = note.heading.toLowerCase();
		const todoLower = todo.text.toLowerCase();
		if (todoLower.includes(headingLower)) {
			return true;
		}

		return false;
	}

	/**
	 * Get TODOs related to a meeting note via shared tags or explicit links
	 */
	async getTodosForMeetingNote(note: MeetingNote): Promise<RelatedTodoItem[]> {
		const allTodos = await this.getAllTodos();
		const relatedTodos: RelatedTodoItem[] = [];
		const noteTagSet = new Set(note.tags.map((t) => t.toLowerCase()));
		const noteTagsOriginal = new Map(note.tags.map((t) => [t.toLowerCase(), t]));

		for (const todo of allTodos) {
			// Skip TODOs from the same file as the meeting note
			// (they're part of the meeting itself)
			if (todo.file.path === note.file.path) {
				continue;
			}

			let relationReason = "";
			const matchingTags: string[] = [];

			// Check for shared tags
			if (noteTagSet.size > 0) {
				const fileTags = await this.getFileTags(todo.file);
				for (const tag of fileTags) {
					if (noteTagSet.has(tag.toLowerCase())) {
						const originalTag = noteTagsOriginal.get(tag.toLowerCase());
						if (originalTag) {
							matchingTags.push(originalTag);
						}
					}
				}
				if (matchingTags.length > 0) {
					relationReason = "shared tag";
				}
			}

			// Check for explicit links
			if (!relationReason && this.todoHasLinkToNote(todo, note)) {
				relationReason = "linked";
			}

			if (relationReason) {
				relatedTodos.push({
					...todo,
					relationReason,
					matchingTags,
				});
			}
		}

		return relatedTodos;
	}

	/**
	 * Format a TODO item for display
	 */
	formatTodoDisplay(todo: TodoItem): string {
		const fileName = todo.file.basename;
		const heading = todo.heading ? ` -> ${todo.heading}` : "";
		return `${todo.text} (${fileName}${heading})`;
	}
}
