import { App, PluginSettingTab, Setting } from "obsidian";
import type ReflectorPlugin from "./main";

export interface ReflectorSettings {
	/** Folder where daily notes are stored (relative to vault root) */
	dailyNotesFolder: string;
	/** The H2 header under which meeting notes (H3) are found */
	meetingNotesHeader: string;
}

export const DEFAULT_SETTINGS: ReflectorSettings = {
	dailyNotesFolder: "_daily",
	meetingNotesHeader: "## Notes",
};

export class ReflectorSettingTab extends PluginSettingTab {
	plugin: ReflectorPlugin;

	constructor(app: App, plugin: ReflectorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Reflector Settings" });

		new Setting(containerEl)
			.setName("Daily notes folder")
			.setDesc("The folder where your daily notes are stored (e.g., _daily)")
			.addText((text) =>
				text
					.setPlaceholder("_daily")
					.setValue(this.plugin.settings.dailyNotesFolder)
					.onChange(async (value) => {
						this.plugin.settings.dailyNotesFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Meeting notes header")
			.setDesc(
				"The H2 header under which meeting notes are found (include ##)"
			)
			.addText((text) =>
				text
					.setPlaceholder("## Notes")
					.setValue(this.plugin.settings.meetingNotesHeader)
					.onChange(async (value) => {
						this.plugin.settings.meetingNotesHeader = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
