import { addIcon, Plugin, WorkspaceLeaf } from 'obsidian';
import { ClaudeTerminalView, VIEW_TYPE_CLAUDE } from './terminal-view';

export default class ClaudeHostPlugin extends Plugin {
	async onload(): Promise<void> {
		// Icon path data sourced from assets/claude.svg
		addIcon('claude-logo', '<path fill="currentColor" fill-rule="evenodd" d="M19.621 66.458l19.667-11.029.333-.958-.333-.533H38.333l-3.292-.2-11.242-.304-9.746-.404-9.442-.508-2.379-.504L0 49.1l.229-1.467 2-1.338 2.858.25 6.333.429 9.492.658 6.883.404 10.204.1063h1.621l.229-.654-.558-.408-.429-.404-9.825-6.65-10.633-7.033-5.567-4.05-3.017-2.046-1.517-1.925-.658-4.2 2.733-3.008 3.671.25.938.254 3.721 2.858 7.95 6.15 10.379 7.638 1.521 1.267.604-.429.079-.304-.683-1.142-5.646-10.192-6.025-10.375-2.683-4.3-.708-2.579a12.375 12.375 0 01-.433-3.038L26.179.558 27.9 0l4.15.558 1.75 1.517 2.583 5.892 4.175 9.288 6.479 12.625 1.9 3.742 1.013 3.467.379 1.063h.658V37.54l.533-7.108.988-8.729.958-11.229.333-3.167 1.567-3.792 3.113-2.05 2.433 1.167 2 2.854-.279 1.85-1.192 7.713-2.329 12.096-1.517 8.092h.883l1.013-1.008 4.104-5.442 6.883-8.6 3.042-3.417 3.542-3.767 2.279-1.796h4.304l3.167 4.704-1.417 4.858-4.433 5.613-3.671 4.758-5.267 7.083-3.292 5.667.304.458.783-.083 11.9-2.525 6.429-1.167 7.671-1.313 3.471 1.617.379 1.646-1.367 3.363-8.204 2.025-9.621 1.925-14.329 3.388-.175.125.204.254 6.454.608 2.758.15h6.758l12.583.938 3.292 2.175 1.975 2.658-.329 2.021-5.063 2.583-6.833-1.621-15.954-3.792-5.467-1.371h-.758v.458l4.554 4.45 8.358 7.542 10.454 9.708.529 2.408-1.342 1.896-1.417-.204-9.188-6.904-3.546-3.113-8.025-6.75h-.533v.708l1.85 2.704 9.771 14.671.508 4.5-.708 1.471-2.533.888-2.783-.508-5.725-8.021-5.896-9.029-4.763-8.096-.583.333-2.808 30.225-1.317 1.542-3.038 1.167-2.529-1.921-1.342-3.113 1.342-6.15 1.621-8.017 1.313-6.375 1.192-7.917.708-2.633-.05-.175-.583.075-5.975 8.196-9.083 12.271-7.192 7.688-1.725.683-2.988-1.542.279-2.758 1.671-2.454 9.95-12.65 6-7.842 3.875-4.525-.025-.658h-.229L17.217 77.333l-4.708.608-2.029-1.9.254-3.108.963-1.013 7.95-5.467-.025.025z"></path>');

		this.registerView(
			VIEW_TYPE_CLAUDE,
			(leaf: WorkspaceLeaf) => new ClaudeTerminalView(leaf, this.manifest.dir ?? '.obsidian/plugins/claude-host')
		);

		this.addRibbonIcon('claude-logo', 'Open Claude Code', () => {
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
