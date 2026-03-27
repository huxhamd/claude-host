import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import * as path from 'path';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

export const VIEW_TYPE_CLAUDE = 'claude-terminal';

export class ClaudeTerminalView extends ItemView {
	private terminal: Terminal;
	private fitAddon: FitAddon;
	private serverProcess: ChildProcess | null = null;
	private resizeObserver: ResizeObserver | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly pluginManifestDir: string) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CLAUDE;
	}

	getDisplayText(): string {
		return 'Claude Code';
	}

	getIcon(): string {
		return 'terminal';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('claude-terminal-container');

		const termEl = container.createDiv({ cls: 'claude-terminal-el' });

		this.terminal = new Terminal({
			cursorBlink: true,
			fontSize: 13,
			fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
			theme: {
				background: '#1e1e1e',
				foreground: '#d4d4d4',
				cursor: '#d4d4d4',
			},
			scrollback: 5000,
		});

		this.fitAddon = new FitAddon();
		this.terminal.loadAddon(this.fitAddon);
		this.terminal.open(termEl);

		setTimeout(() => this.fitAddon.fit(), 50);

		this.resizeObserver = new ResizeObserver(() => this.fitAddon.fit());
		this.resizeObserver.observe(termEl);
		this.register(() => this.resizeObserver?.disconnect());

		await this.spawnShell();
	}

	private async spawnShell(): Promise<void> {
		const vaultPath = this.getVaultPath();
		if (!vaultPath) {
			this.terminal.write('\r\nError: Could not determine vault path. This plugin requires a local vault.\r\n');
			return;
		}

		const pluginDir = path.join(vaultPath, this.pluginManifestDir);
		const serverScript = path.join(pluginDir, 'pty-server.js');

		try {
			this.serverProcess = spawn('node', [
				serverScript,
				String(this.terminal.cols),
				String(this.terminal.rows),
				vaultPath,
			], { stdio: ['pipe', 'pipe', 'pipe'] });
		} catch (e) {
			this.terminal.write(`\r\nFailed to start pty-server.js: ${e}\r\n`);
			return;
		}

		let readBuf = Buffer.alloc(0);

		this.serverProcess.stdout!.on('data', (chunk: Buffer) => {
			readBuf = Buffer.concat([readBuf, chunk]);
			while (readBuf.length >= 4) {
				const len = readBuf.readUInt32BE(0);
				if (readBuf.length < 4 + len) break;
				this.terminal.write(readBuf.slice(4, 4 + len).toString('utf8'));
				readBuf = readBuf.slice(4 + len);
			}
		});

		this.serverProcess.stderr!.on('data', (chunk: Buffer) => {
			this.terminal.write(chunk.toString());
		});

		this.serverProcess.on('exit', () => {
			this.serverProcess = null;
			this.leaf.detach();
		});

		this.terminal.onData((data: string) => this.sendInput(data));
		this.terminal.onResize(({ cols, rows }) => this.sendResize(cols, rows));
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

	private getVaultPath(): string | null {
		const adapter = this.app.vault.adapter;
		if ('basePath' in adapter) {
			return (adapter as { basePath: string }).basePath;
		}
		return null;
	}

	async onClose(): Promise<void> {
		const proc = this.serverProcess;
		this.serverProcess = null;
		proc?.kill();
		this.terminal?.dispose();
	}
}
