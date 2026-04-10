import { App, PluginSettingTab, Setting } from 'obsidian';
import { FONT_FAMILY_OPTIONS } from './settings';
import type ClaudeHostPlugin from './main';

export class ClaudeHostSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: ClaudeHostPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Claude Host' });

		new Setting(containerEl)
			.setName('Font size')
			.setDesc('Terminal font size in points (10–24).')
			.addSlider(s => s
				.setLimits(10, 24, 1)
				.setValue(this.plugin.settings.fontSize)
				.setDynamicTooltip()
				.onChange(async v => {
					this.plugin.settings.fontSize = v;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Font family')
			.setDesc('Terminal font. Must be installed on your system.')
			.addDropdown(d => {
				for (const name of Object.keys(FONT_FAMILY_OPTIONS)) d.addOption(name, name);
				d.setValue(this.plugin.settings.fontFamily)
				 .onChange(async v => {
					 this.plugin.settings.fontFamily = v;
					 await this.plugin.saveSettings();
				 });
			});

		new Setting(containerEl)
			.setName('Scrollback buffer')
			.setDesc('Lines retained in scrollback (100–50000). Takes effect when the terminal next opens.')
			.addText(t => t
				.setPlaceholder('5000')
				.setValue(String(this.plugin.settings.scrollback))
				.onChange(async v => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 100 && n <= 50000) {
						this.plugin.settings.scrollback = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Cursor blink')
			.setDesc('Animate the terminal cursor.')
			.addToggle(t => t
				.setValue(this.plugin.settings.cursorBlink)
				.onChange(async v => {
					this.plugin.settings.cursorBlink = v;
					await this.plugin.saveSettings();
				}));

	}
}
