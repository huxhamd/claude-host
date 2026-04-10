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

		const scrollbackSetting = new Setting(containerEl)
			.setName('Scrollback buffer')
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

		scrollbackSetting.descEl.createDiv({ text: 'Lines retained in scrollback (100–50000).' });
		scrollbackSetting.descEl.createDiv({ text: 'Requires a relaunch to take effect.', cls: 'claude-settings-relaunch-note' });
		const relaunchBtn = scrollbackSetting.descEl.createEl('button', {
			text: 'Relaunch',
			cls: 'mod-cta claude-settings-relaunch-btn',
		});
		relaunchBtn.addEventListener('click', () => this.plugin.relaunchTerminal());
		scrollbackSetting.descEl.createDiv({
			text: 'Warning: this will kill your current Claude Code session.',
			cls: 'claude-settings-warning',
		});

	}
}
