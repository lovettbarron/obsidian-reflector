import { Plugin, MarkdownView } from "obsidian";
import {
	DEFAULT_SETTINGS,
	ReflectorSettings,
	ReflectorSettingTab,
} from "./settings";
import { MeetingNoteParser } from "./services/meeting-note-parser";
import { TagService } from "./services/tag-service";
import { TodoService } from "./services/todo-service";
import { ReflectorView, VIEW_TYPE_REFLECTOR } from "./views/reflector-view";

export default class ReflectorPlugin extends Plugin {
	settings: ReflectorSettings;
	parser: MeetingNoteParser;
	tagService: TagService;
	todoService: TodoService;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize services
		this.parser = new MeetingNoteParser(this.app, this.settings);
		this.tagService = new TagService(this.app);
		this.todoService = new TodoService(this.app);

		// Register the sidebar view
		this.registerView(VIEW_TYPE_REFLECTOR, (leaf) => new ReflectorView(leaf, this));

		// Auto-open sidebar when plugin loads
		this.app.workspace.onLayoutReady(() => {
			void this.activateView();
		});

		// Add ribbon icon to open the view
		this.addRibbonIcon("glasses", "Open reflector", () => {
			void this.activateView();
		});

		// Add command to open the view
		this.addCommand({
			id: "open-reflector",
			name: "Open sidebar",
			callback: () => void this.activateView(),
		});

		// Add command to refresh the view
		this.addCommand({
			id: "refresh-reflector",
			name: "Refresh sidebar",
			callback: () => void this.refreshView(),
		});

		// Register settings tab
		this.addSettingTab(new ReflectorSettingTab(this.app, this));

		// Listen for file open - this sets up tracking for the new file
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				this.handleFileOpen();
			})
		);

		// Listen for active leaf changes - user switched to a different editor
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				// Only handle if it's a markdown view
				if (leaf?.view instanceof MarkdownView) {
					this.handleFileOpen();
				}
			})
		);

		// Poll for cursor position changes within the tracked editor
		// This does NOT re-query which file is open - it only checks cursor position
		this.registerInterval(
			window.setInterval(() => this.checkCursorPosition(), 300)
		);

		// Listen for file modifications
		this.registerEvent(
			this.app.vault.on("modify", () => {
				this.refreshView();
			})
		);
	}

	onunload(): void {
		// Note: Don't detach leaves here as it resets leaf position on reload
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<ReflectorSettings>
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Reinitialize parser with new settings
		this.parser = new MeetingNoteParser(this.app, this.settings);
		void this.refreshView();
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_REFLECTOR)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: VIEW_TYPE_REFLECTOR,
					active: true,
				});
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			void workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Called when a file is opened or active leaf changes.
	 * Gets the current markdown view and passes file/editor to the sidebar.
	 */
	private handleFileOpen(): void {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = markdownView?.file ?? null;
		const editor = markdownView?.editor ?? null;

		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REFLECTOR);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ReflectorView) {
				view.onFileOpen(file, editor);
			}
		}
	}

	/**
	 * Called periodically to check cursor position in the tracked editor.
	 * Does NOT re-query which file is open.
	 */
	private checkCursorPosition(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REFLECTOR);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ReflectorView) {
				void view.checkCursorPosition();
			}
		}
	}

	private refreshView(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REFLECTOR);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ReflectorView) {
				void view.refresh();
			}
		}
	}
}
