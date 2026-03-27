import { Plugin, WorkspaceLeaf } from 'obsidian';
import { ClaudeTerminalView, VIEW_TYPE_CLAUDE } from './terminal-view';

export default class ClaudeHostPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(
			VIEW_TYPE_CLAUDE,
			(leaf: WorkspaceLeaf) => new ClaudeTerminalView(leaf, this.manifest.dir ?? '.obsidian/plugins/claude-host')
		);

		this.addRibbonIcon('terminal', 'Open Claude Code', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-claude-terminal',
			name: 'Open Claude Code terminal',
			callback: () => {
				this.activateView();
			},
		});

		this.app.workspace.onLayoutReady(() => {
			if (this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE).length === 0) {
				this.activateView();
			}
		});
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CLAUDE);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_CLAUDE)[0];

		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf('tab');
			await leaf.setViewState({ type: VIEW_TYPE_CLAUDE, active: true });
		}

		workspace.revealLeaf(leaf);
	}
}
