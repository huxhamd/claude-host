/// <reference types="node" />
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import * as path from 'path';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { promises as fs } from 'fs';

export const VIEW_TYPE_CLAUDE = 'claude-terminal';

export class ClaudeTerminalView extends ItemView {
	private terminal: Terminal | null = null;
	private fitAddon: FitAddon | null = null;
	private webLinksAddon: WebLinksAddon | null = null;
	private termEl: HTMLElement | null = null;
	private errorEl: HTMLElement | null = null;
	private serverProcess: ChildProcess | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private ptyResizeTimer: ReturnType<typeof setTimeout> | null = null;
	private onContextMenu: ((e: MouseEvent) => Promise<void>) | null = null;
	private onLinkMouseMove: ((e: MouseEvent) => void) | null = null;
	private linkTooltip: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly pluginManifestDir: string) {
		super(leaf);
	}

	get isSessionRunning(): boolean {
		return this.serverProcess !== null;
	}

	getViewType(): string {
		return VIEW_TYPE_CLAUDE;
	}

	getDisplayText(): string {
		return 'Claude Code';
	}

	getIcon(): string {
		return 'claude-logo';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('claude-terminal-container');

		this.termEl = container.createDiv({ cls: 'claude-terminal-el' });
		this.errorEl = container.createDiv({ cls: 'claude-error-panel' });

		try {
			await this.initTerminal();
		} catch (e) {
			this.showError('An unexpected error occurred.', String(e));
		}

		this.registerEvent(this.app.workspace.on('css-change', () => {
			if (this.terminal) {
				this.terminal.options.theme = this.getTerminalTheme();
			}
		}));
	}

	private positionLinkTooltip(x: number, y: number): void {
		if (!this.linkTooltip) return;
		const offset = 12;
		const minWidth = 200;
		const maxWidth = 400;
		const available = window.innerWidth - (x + offset);
		this.linkTooltip.style.maxWidth = `${Math.max(minWidth, Math.min(maxWidth, available))}px`;
		const left = Math.min(x + offset, window.innerWidth - minWidth);
		this.linkTooltip.style.left = `${left}px`;
		const belowY = y + 16;
		this.linkTooltip.style.top = `${belowY}px`;
		if (belowY + this.linkTooltip.offsetHeight > window.innerHeight) {
			this.linkTooltip.style.top = `${y - this.linkTooltip.offsetHeight - 8}px`;
		}
	}

	private getTerminalTheme() {
		const isDark = document.body.classList.contains('theme-dark');
		const bg = getComputedStyle(document.body).getPropertyValue('--background-primary').trim();

		if (isDark) {
			return {
				background: bg || '#1e1e1e',
				foreground: '#ffffff',
				cursor: '#ffffff',
				selectionBackground: 'rgba(177, 185, 249, 0.3)',
				selectionInactiveBackground: 'rgba(153, 153, 153, 0.2)',
				black: '#1e1e1e',
				red: '#ff6b80',
				green: '#4eba65',
				yellow: '#ffc107',
				blue: '#b1b9f9',
				magenta: '#fd5db1',
				cyan: '#7ec8e3',
				white: '#d4d4d4',
				brightBlack: '#999999',
				brightRed: '#ff8fa0',
				brightGreen: '#72cc83',
				brightYellow: '#ffd147',
				brightBlue: '#c8cefb',
				brightMagenta: '#fe80c4',
				brightCyan: '#a0d9ee',
				brightWhite: '#ffffff',
			};
		} else {
			return {
				background: bg || '#ffffff',
				foreground: '#000000',
				cursor: '#000000',
				selectionBackground: 'rgba(87, 105, 247, 0.25)',
				selectionInactiveBackground: 'rgba(102, 102, 102, 0.2)',
				black: '#000000',
				red: '#ab2b3f',
				green: '#2c7a39',
				yellow: '#966c1e',
				blue: '#5769f7',
				magenta: '#ff0087',
				cyan: '#0369a1',
				white: '#f5f5f5',
				brightBlack: '#666666',
				brightRed: '#8a2233',
				brightGreen: '#235f2c',
				brightYellow: '#7a5718',
				brightBlue: '#4355c5',
				brightMagenta: '#cc006c',
				brightCyan: '#025270',
				brightWhite: '#ffffff',
			};
		}
	}

	private async initTerminal(): Promise<void> {
		this.terminal = new Terminal({
			cursorBlink: true,
			fontSize: 13,
			fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
			theme: this.getTerminalTheme(),
			scrollback: 5000,
		});

		this.fitAddon = new FitAddon();
		this.terminal.loadAddon(this.fitAddon);
		this.terminal.open(this.termEl!);

		const webgl = new WebglAddon();
		webgl.onContextLoss(() => {
			webgl.dispose();
			this.terminal?.loadAddon(new WebglAddon());
			// WebLinksAddon is unaffected by WebGL context loss — no need to reload it.
		});
		this.terminal.loadAddon(webgl);

		this.webLinksAddon = new WebLinksAddon(
			(event, uri) => {
				if (event.ctrlKey || event.metaKey) {
					window.open(uri, '_blank');
				}
			},
			{
				hover: (event, uri) => {
					this.linkTooltip?.remove();
					this.linkTooltip = document.body.createEl('div', { cls: 'claude-link-tooltip' });
					this.linkTooltip.createEl('span', { cls: 'claude-link-tooltip-url', text: uri });
					const modifier = navigator.userAgent.includes('Macintosh') ? 'Cmd' : 'Ctrl';
					this.linkTooltip.createEl('span', { cls: 'claude-link-tooltip-hint', text: `${modifier}+Click to follow link` });
					this.positionLinkTooltip(event.clientX, event.clientY);
				},
				leave: () => {
					this.linkTooltip?.remove();
					this.linkTooltip = null;
				},
			}
		);
		this.terminal.loadAddon(this.webLinksAddon);

		this.onLinkMouseMove = (e: MouseEvent) => {
			if (!this.linkTooltip) return;
			this.positionLinkTooltip(e.clientX, e.clientY);
		};
		this.termEl!.addEventListener('mousemove', this.onLinkMouseMove);

		// Wait until the Obsidian panel has actual pixel dimensions before
		// fitting — proposeDimensions() returns undefined until layout is done.
		await new Promise<void>(resolve => {
			if (this.termEl!.offsetWidth > 0) { resolve(); return; }
			const sizer = new ResizeObserver(() => {
				if (this.termEl?.offsetWidth) { sizer.disconnect(); resolve(); }
			});
			sizer.observe(this.termEl!);
		});
		this.fitAddon.fit();

		// Keep fitting on every subsequent panel resize, but only when the
		// container has real pixel width. Fitting to zero (hidden sidebar)
		// would shrink the terminal to its minimum size.
		this.resizeObserver = new ResizeObserver(() => {
			if (this.termEl?.offsetWidth) this.fitAddon?.fit();
		});
		this.resizeObserver.observe(this.termEl!);

		this.onContextMenu = async (e: MouseEvent) => {
			e.preventDefault();
			const selection = this.terminal?.getSelection();
			if (selection) {
				await navigator.clipboard.writeText(selection);
				this.terminal?.clearSelection();
			} else {
				try {
					const text = await navigator.clipboard.readText();
					if (text) this.sendInput(text);
				} catch {
					// clipboard read failed (e.g. no permission) — ignore silently
				}
			}
		};
		this.termEl!.addEventListener('contextmenu', this.onContextMenu);

		await this.spawnShell();
	}

	private teardownTerminal(): void {
		if (this.ptyResizeTimer) {
			clearTimeout(this.ptyResizeTimer);
			this.ptyResizeTimer = null;
		}
		const proc = this.serverProcess;
		this.serverProcess = null;
		proc?.kill();
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		if (this.onContextMenu) {
			this.termEl?.removeEventListener('contextmenu', this.onContextMenu);
			this.onContextMenu = null;
		}
		if (this.onLinkMouseMove) {
			this.termEl?.removeEventListener('mousemove', this.onLinkMouseMove);
			this.onLinkMouseMove = null;
		}
		this.fitAddon?.dispose();
		this.fitAddon = null;
		this.webLinksAddon?.dispose();
		this.webLinksAddon = null;
		this.linkTooltip?.remove();
		this.linkTooltip = null;
		this.terminal?.dispose();
		this.terminal = null;
		this.termEl?.empty();
	}

	private async spawnShell(): Promise<void> {
		const terminal = this.terminal;
		if (!terminal) return;
		const vaultPath = this.getVaultPath();
		if (!vaultPath) {
			this.showError('Could not determine vault path. This plugin requires a local vault.');
			return;
		}

		const pluginDir = path.join(vaultPath, this.pluginManifestDir);
		const serverScript = path.join(pluginDir, 'pty-server.js');

		try {
			await fs.access(serverScript);
		} catch {
			this.showError('Claude Host could not be started.', `Plugin file not found: ${serverScript}`);
			return;
		}

		try {
			this.serverProcess = spawn('node', [
				serverScript,
				String(terminal.cols),
				String(terminal.rows),
				vaultPath,
			], { stdio: ['pipe', 'pipe', 'pipe'] });
		} catch (e) {
			this.showError('Claude Host could not be started.', String(e));
			return;
		}

		let readBuf = Buffer.alloc(0);
		let stderrOutput = '';

		this.serverProcess.stdout!.on('data', (chunk: Buffer) => {
			readBuf = Buffer.concat([readBuf, chunk]);
			while (readBuf.length >= 4) {
				const len = readBuf.readUInt32BE(0);
				if (readBuf.length < 4 + len) break;
				this.terminal?.write(readBuf.subarray(4, 4 + len).toString('utf8'));
				readBuf = readBuf.subarray(4 + len);
			}
		});

		const STDERR_MAX = 10 * 1024;
		this.serverProcess.stderr!.on('data', (chunk: Buffer) => {
			stderrOutput += chunk.toString();
			if (stderrOutput.length > STDERR_MAX)
				stderrOutput = stderrOutput.slice(-STDERR_MAX);
		});

		this.serverProcess.on('exit', (code) => {
			this.serverProcess = null;
			if (code === 0 || code === null) {
				this.leaf.detach();
			} else {
				const stderr = stderrOutput.trim();
				const details = [stderr, `Exit code: ${code}`].filter(Boolean).join('\n\n');
				this.showError('Claude Code stopped unexpectedly.', details);
			}
		});

		terminal.onData((data: string) => this.sendInput(data));

		// Decouple the PTY resize from xterm's visual resize. xterm may fire
		// onResize many times per second while the user drags a panel divider;
		// sending every event to ConPTY causes it to scroll-and-redraw
		// repeatedly, flooding the scrollback with stale UI fragments.
		//
		// Instead, debounce: let xterm resize visually on every frame, but only
		// notify the PTY once the user stops dragging. ESC[3J is queued just
		// before that single notification so it sits ahead of ConPTY's response
		// in xterm's write queue — the clear runs first, then ConPTY's single
		// clean redraw repopulates the scrollback from its own history.
		terminal.onResize(() => {
			if (this.ptyResizeTimer) clearTimeout(this.ptyResizeTimer);
			this.ptyResizeTimer = setTimeout(() => {
				this.terminal?.write('\x1b[3J');
				this.sendResize(this.terminal?.cols ?? 80, this.terminal?.rows ?? 24);
				this.ptyResizeTimer = null;
			}, 50); // ~3 animation frames — enough drag-pause detection with margin for ConPTY IPC
		});
	}

	private sendInput(data: string): void {
		if (!this.serverProcess?.stdin) return;
		const dataBuf = Buffer.from(data, 'utf8');
		const msg = Buffer.allocUnsafe(5 + dataBuf.length);
		msg[0] = 0;
		msg.writeUInt32BE(dataBuf.length, 1);
		dataBuf.copy(msg, 5);
		this.serverProcess.stdin.write(msg);
	}

	private sendResize(cols: number, rows: number): void {
		if (!this.serverProcess?.stdin) return;
		const msg = Buffer.allocUnsafe(5);
		msg[0] = 1;
		msg.writeUInt16BE(cols, 1);
		msg.writeUInt16BE(rows, 3);
		this.serverProcess.stdin.write(msg);
	}

	private showError(message: string, details?: string): void {
		if (!this.termEl || !this.errorEl) return;
		this.termEl.style.display = 'none';
		this.errorEl.style.display = 'flex';
		this.errorEl.empty();

		const content = this.errorEl.createDiv({ cls: 'claude-error-content' });
		content.createEl('p', { cls: 'claude-error-plugin-name', text: 'Claude Host' });
		content.createEl('p', { cls: 'claude-error-heading', text: 'Oops! Something went wrong.' });
		content.createEl('p', { cls: 'claude-error-description', text: message });

		const actions = content.createDiv({ cls: 'claude-error-actions' });

		const relaunchBtn = actions.createEl('button', { cls: 'claude-error-btn claude-error-btn-primary', text: 'Relaunch' });
		relaunchBtn.addEventListener('click', async () => {
			relaunchBtn.disabled = true;
			this.teardownTerminal();
			this.errorEl!.style.display = 'none';
			this.termEl!.style.display = '';
			try {
				await this.initTerminal();
			} catch (e) {
				this.showError('An unexpected error occurred.', String(e));
			}
		});

		const closeBtn = actions.createEl('button', { cls: 'claude-error-btn', text: 'Close' });
		closeBtn.addEventListener('click', () => this.leaf.detach());

		if (details && details !== message) {
			const detailsBtn = content.createEl('button', { cls: 'claude-error-btn claude-error-details-btn', text: 'Show error details' });
			const detailsEl = content.createEl('pre', { cls: 'claude-error-details', text: details });
			detailsBtn.addEventListener('click', () => {
				const visible = detailsEl.style.display === 'block';
				detailsEl.style.display = visible ? 'none' : 'block';
				detailsBtn.textContent = visible ? 'Show error details' : 'Hide error details';
			});
		}
	}

	private getVaultPath(): string | null {
		const adapter = this.app.vault.adapter;
		if ('basePath' in adapter) {
			return (adapter as { basePath: string }).basePath;
		}
		return null;
	}

	async onClose(): Promise<void> {
		this.teardownTerminal();
	}
}
