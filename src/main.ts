import { Plugin } from "obsidian";
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
			this.activateView();
		});

		// Add ribbon icon to open the view
		this.addRibbonIcon("glasses", "Open Reflector", () => {
			this.activateView();
		});

		// Add command to open the view
		this.addCommand({
			id: "open-reflector",
			name: "Open Reflector sidebar",
			callback: () => this.activateView(),
		});

		// Add command to refresh the view
		this.addCommand({
			id: "refresh-reflector",
			name: "Refresh Reflector",
			callback: () => this.refreshView(),
		});

		// Register settings tab
		this.addSettingTab(new ReflectorSettingTab(this.app, this));

		// Listen for active file changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.updateView();
			})
		);

		// Listen for file open
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.updateView();
			})
		);

		// Poll for cursor position changes (no native cursor-change event)
		this.registerInterval(
			window.setInterval(() => this.updateView(), 300)
		);

		// Listen for file modifications
		this.registerEvent(
			this.app.vault.on("modify", () => {
				this.refreshView();
			})
		);
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_REFLECTOR);
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
		this.refreshView();
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
			workspace.revealLeaf(leaf);
		}
	}

	private updateView(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REFLECTOR);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ReflectorView) {
				view.onCursorChange();
			}
		}
	}

	private refreshView(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REFLECTOR);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ReflectorView) {
				view.refresh();
			}
		}
	}
}
