import { App, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_SETTINGS } from './settings';
import { VIEW_TYPE_CLAUDE } from './terminal-view';
import type ClaudeHostPlugin from './main';

export class ClaudeHostSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: ClaudeHostPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Claude Host' });

		// Use the values the current session was actually started with, so that
		// warnings persist correctly if the settings page is closed and reopened
		// without relaunching. Falls back to current settings when no session exists.
		let appliedScrollback = this.plugin.appliedSettings?.scrollback ?? this.plugin.settings.scrollback;
		let appliedClaudeArgs = this.plugin.appliedSettings?.claudeArgs ?? this.plugin.settings.claudeArgs;
		const hasSession = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE).length > 0;

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

		const scrollbackSetting = new Setting(containerEl)
			.setName('Scrollback buffer')
			.addText(t => {
				t.inputEl.type = 'number';
				t.inputEl.min  = '100';
				t.inputEl.max  = '50000';
				t.setValue(String(this.plugin.settings.scrollback))
				 .onChange(async v => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 100 && n <= 50000) {
						this.plugin.settings.scrollback = n;
						validationEl.style.display = 'none';
					} else {
						this.plugin.settings.scrollback = DEFAULT_SETTINGS.scrollback;
						validationEl.style.display = '';
					}
					scrollbackRelaunchEl.style.display = hasSession && this.plugin.settings.scrollback !== appliedScrollback ? '' : 'none';
					await this.plugin.saveSettings();
				});
			});

		scrollbackSetting.descEl.createDiv({ text: 'Lines retained in scrollback (100–50000).' });
		const validationEl = scrollbackSetting.descEl.createDiv({
			text: 'Must be between 100 and 50000. Using default (5000) until corrected.',
			cls: 'claude-settings-warning',
		});
		validationEl.style.display = 'none';
		const scrollbackRelaunchEl = scrollbackSetting.descEl.createDiv({
			text: 'Requires a relaunch to take effect.',
			cls: 'claude-settings-warning claude-settings-relaunch-note',
		});
		scrollbackRelaunchEl.style.display = hasSession && this.plugin.settings.scrollback !== appliedScrollback ? '' : 'none';

		const argsSetting = new Setting(containerEl)
			.setName('Extra arguments')
			.addTextArea(t => {
				t.setPlaceholder('e.g. --model claude-opus-4-6 --verbose')
				 .setValue(this.plugin.settings.claudeArgs)
				 .onChange(async v => {
					this.plugin.settings.claudeArgs = v.replace(/\s+/g, ' ').trim();
					argsRelaunchEl.style.display = hasSession && this.plugin.settings.claudeArgs !== appliedClaudeArgs ? '' : 'none';
					await this.plugin.saveSettings();
				});
				t.inputEl.style.width = '100%';
				t.inputEl.rows = 3;
			});

		argsSetting.descEl.createDiv({ text: 'Additional arguments passed to claude on launch.' });
		const argsRelaunchEl = argsSetting.descEl.createDiv({
			text: 'Requires a relaunch to take effect.',
			cls: 'claude-settings-warning claude-settings-relaunch-note',
		});
		argsRelaunchEl.style.display = hasSession && this.plugin.settings.claudeArgs !== appliedClaudeArgs ? '' : 'none';

		const sessionSetting = new Setting(containerEl)
			.setName('Session')
			.addButton(b => b
				.setButtonText(hasSession ? 'Relaunch' : 'Launch')
				.setCta()
				.onClick(() => {
					appliedScrollback = this.plugin.settings.scrollback;
					appliedClaudeArgs = this.plugin.settings.claudeArgs;
					scrollbackRelaunchEl.style.display = 'none';
					argsRelaunchEl.style.display = 'none';
					this.plugin.relaunchTerminal();
				}));

		if (hasSession) {
			sessionSetting.descEl.createDiv({
				text: 'Warning: relaunching will kill your current Claude Code session.',
				cls: 'claude-settings-warning',
			});
		}
	}
}
