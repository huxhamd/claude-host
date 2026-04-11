/// <reference types="node" />
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { ClaudeHostSettings } from './settings';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import * as path from 'path';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { promises as fs } from 'fs';

export const VIEW_TYPE_CLAUDE = 'claude-terminal';

export class ClaudeTerminalView extends ItemView {
	private static readonly ESC = String.fromCharCode(27);
	private static readonly BEL = String.fromCharCode(7);
	private static readonly ANSI_RE = new RegExp(
		ClaudeTerminalView.ESC + '(?:\\[[0-9;?]*[A-Za-z]|\\][^'
		+ ClaudeTerminalView.BEL + ClaudeTerminalView.ESC
		+ ']*(?:' + ClaudeTerminalView.BEL + '|' + ClaudeTerminalView.ESC + '\\\\)|.)',
		'g'
	);

	private terminal: Terminal | null = null;
	private fitAddon: FitAddon | null = null;
	private webLinksAddon: WebLinksAddon | null = null;
	private termEl: HTMLElement | null = null;
	private errorEl: HTMLElement | null = null;
	private loadingEl: HTMLElement | null = null;
	private serverProcess: ChildProcess | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private ptyResizeTimer: ReturnType<typeof setTimeout> | null = null;
	private onContextMenu: ((e: MouseEvent) => Promise<void>) | null = null;
	private onLinkMouseMove: ((e: MouseEvent) => void) | null = null;
	private onTerminalKey: ((e: KeyboardEvent) => boolean) | null = null;
	private onDragMouseDown: ((e: MouseEvent) => void) | null = null;
	private onDragMouseMove: ((e: MouseEvent) => void) | null = null;
	private linkTooltip: HTMLElement | null = null;
	private selectionAnchor: { col: number; row: number } | null = null;
	private selectionActive: { col: number; row: number } | null = null;
	private selectionPreviousAnchor: { col: number; row: number } | null = null;
	private isUpdatingSelection = false;
	private dragOriginPixel: { x: number; y: number } | null = null;
	private lastMouseMovePixel: { x: number; y: number } | null = null;
	private selectionDragReversed = false;
	private isRelaunching = false;
	private readonly linkModifier = navigator.userAgent.includes('Macintosh') ? 'Cmd' : 'Ctrl';

	constructor(
		leaf: WorkspaceLeaf,
		private readonly pluginManifestDir: string,
		private settings: ClaudeHostSettings,
	) {
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

		this.loadingEl = container.createDiv({ cls: 'claude-loading-panel' });
		const loadingContent = this.loadingEl.createDiv({ cls: 'claude-loading-content' });
		loadingContent.createEl('p', { cls: 'claude-loading-name', text: 'Claude Host' });
		loadingContent.createEl('p', { cls: 'claude-loading-status', text: 'Loading...' });
		loadingContent.createDiv({ cls: 'claude-loading-spinner' });

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
		if (this.loadingEl) this.loadingEl.style.display = 'flex';

		this.terminal = new Terminal({
			cursorBlink: true,
			fontSize:    this.settings.fontSize,
			fontFamily:  '"Cascadia Code", "Fira Code", Consolas, monospace',
			theme:       this.getTerminalTheme(),
			scrollback:  this.settings.scrollback,
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
					this.linkTooltip.createEl('span', { cls: 'claude-link-tooltip-hint', text: `${this.linkModifier}+Click to follow link` });
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
		// Any active selection is cleared — xterm reflows the buffer on resize,
		// so our stored anchor/active row/col coordinates would no longer point
		// at the intended characters.
		this.resizeObserver = new ResizeObserver(() => {
			if (this.termEl?.offsetWidth) {
				this.terminal?.clearSelection();
				this.fitAddon?.fit();
			}
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

		// Record the mousedown pixel and track the latest mousemove pixel.
		// On each selectionChange, compute drag direction from mousedown vs
		// the last mousemove — this captures the real-time direction at the
		// moment the selection actually changed, immune to post-drag parking.
		this.onDragMouseDown = (e: MouseEvent) => {
			// Only left-button drags create text selections. Ignoring other
			// buttons prevents a right-click context menu from stomping the
			// drag origin before the next real left-click drag.
			if (e.button !== 0) return;
			this.dragOriginPixel = { x: e.clientX, y: e.clientY };
			this.lastMouseMovePixel = null;
			this.selectionDragReversed = false;
		};
		this.termEl!.addEventListener('mousedown', this.onDragMouseDown);

		this.onDragMouseMove = (e: MouseEvent) => {
			// Only track while a drag is in progress — outside of that the
			// value is unused and we'd be allocating an object per mousemove.
			if (!this.dragOriginPixel) return;
			this.lastMouseMovePixel = { x: e.clientX, y: e.clientY };
		};
		this.termEl!.addEventListener('mousemove', this.onDragMouseMove);

		this.terminal.onSelectionChange(() => {
			if (this.isUpdatingSelection) return;
			this.selectionAnchor = null;
			this.selectionActive = null;
			this.selectionPreviousAnchor = null;
			// Determine drag direction at the moment the selection changes.
			if (this.dragOriginPixel && this.lastMouseMovePixel && this.termEl && this.terminal) {
				const lineH = this.termEl.getBoundingClientRect().height / this.terminal.rows;
				const dy = this.lastMouseMovePixel.y - this.dragOriginPixel.y;
				if (dy < -lineH / 2) {
					this.selectionDragReversed = true;
				} else if (dy > lineH / 2) {
					this.selectionDragReversed = false;
				} else {
					// Same row — use horizontal direction
					this.selectionDragReversed = this.lastMouseMovePixel.x < this.dragOriginPixel.x;
				}
			}
		});

		// xterm accepts only a single custom key event handler, so this dispatcher
		// tries each sub-handler in turn and returns the first non-null result.
		// Each sub-handler returns null to mean "not handled, try the next one".
		// Returning false prevents xterm from forwarding the key to the PTY;
		// returning true lets it pass through.
		this.onTerminalKey = (e: KeyboardEvent) => {
			const shiftArrowResult = this.handleShiftArrowKey(e);
			if (shiftArrowResult !== null) return shiftArrowResult;
			const clipboardResult = this.handleClipboardKey(e);
			if (clipboardResult !== null) return clipboardResult;
			return true;
		};
		this.terminal.attachCustomKeyEventHandler(this.onTerminalKey);

		await this.spawnShell();
	}

	async relaunch(): Promise<void> {
		if (this.isRelaunching) return;
		this.isRelaunching = true;
		this.teardownTerminal();
		if (this.errorEl) this.errorEl.style.display = 'none';
		if (this.termEl) this.termEl.style.display = '';
		if (this.loadingEl) this.loadingEl.style.display = 'flex';
		try {
			await this.initTerminal();
		} catch (e) {
			this.showError('An unexpected error occurred.', String(e));
		} finally {
			this.isRelaunching = false;
		}
	}

	applySettings(settings: ClaudeHostSettings): void {
		this.settings = settings;
		if (!this.terminal) return;

		this.terminal.options.fontSize = settings.fontSize;
		this.terminal.options.theme   = this.getTerminalTheme();
		// scrollback omitted — xterm does not support live buffer resize;
		// the new value takes effect the next time initTerminal() runs.

		this.fitAddon?.fit(); // font size change may alter col/row count
	}

	private teardownTerminal(): void {
		if (this.ptyResizeTimer) {
			clearTimeout(this.ptyResizeTimer);
			this.ptyResizeTimer = null;
		}
		const proc = this.serverProcess;
		this.serverProcess = null;
		if (proc) {
			proc.removeAllListeners('exit');
			proc.kill();
		}
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
		this.onTerminalKey = null; // cleared by terminal.dispose() below; nulled here for consistency
		if (this.onDragMouseDown) {
			this.termEl?.removeEventListener('mousedown', this.onDragMouseDown);
			this.onDragMouseDown = null;
		}
		if (this.onDragMouseMove) {
			this.termEl?.removeEventListener('mousemove', this.onDragMouseMove);
			this.onDragMouseMove = null;
		}
		this.selectionAnchor = null;
		this.selectionActive = null;
		this.selectionPreviousAnchor = null;
		this.isUpdatingSelection = false;
		this.dragOriginPixel = null;
		this.lastMouseMovePixel = null;
		this.selectionDragReversed = false;
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
				const data = readBuf.subarray(4, 4 + len).toString('utf8');
				if (this.loadingEl && this.isReadyToShow(data)) {
					this.loadingEl.style.display = 'none';
				}
				this.terminal?.write(data);
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

	private initSelectionEndpoints(): boolean {
		const pos = this.terminal!.getSelectionPosition();
		if (!pos) return false;
		// getSelectionPosition() returns geometrically ordered start/end regardless of
		// drag direction. The .x/.y fields are absolute buffer coordinates (not viewport-
		// relative), so they can be clamped directly against buffer.length elsewhere.
		// selectionDragReversed was computed in onSelectionChange by comparing mousedown
		// vs the last mousemove pixel at the moment the selection changed — immune to
		// post-drag mouse parking.
		this.selectionAnchor = this.selectionDragReversed ? { col: pos.end.x,   row: pos.end.y   }
		                                                  : { col: pos.start.x, row: pos.start.y };
		this.selectionActive = this.selectionDragReversed ? { col: pos.start.x, row: pos.start.y }
		                                                  : { col: pos.end.x,   row: pos.end.y   };
		return true;
	}

	// Returns null if this event is not a Shift+Arrow key we handle.
	private handleShiftArrowKey(e: KeyboardEvent): boolean | null {
		if (e.type !== 'keydown' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return null;
		if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return null;
		if (!this.terminal) return true;
		if (!this.selectionAnchor || !this.selectionActive) {
			// No keyboard-maintained selection yet — try to adopt an existing
			// mouse selection. If there's no selection at all, let the key pass
			// through to the PTY so the shell cursor still moves with Shift+Arrow.
			// Getting accurate cursor-position data back from xterm + node-pty to
			// open a fresh selection from the cursor proved too fragile to support.
			if (!this.initSelectionEndpoints()) return true;
		}
		return this.applyShiftArrowStep(e.key);
	}

	// Returns null if this event is not a clipboard shortcut we handle.
	private handleClipboardKey(e: KeyboardEvent): boolean | null {
		if (e.type !== 'keydown') return null;
		if (!e.ctrlKey && !e.metaKey) return null;
		if (e.key === 'c') {
			const selection = this.terminal?.getSelection();
			if (selection) {
				navigator.clipboard.writeText(selection).catch(() => {});
				return false; // consume — do not send as SIGINT
			}
			return true; // no selection → pass through as SIGINT
		}
		if (e.key === 'x') {
			const selection = this.terminal?.getSelection();
			if (selection) {
				navigator.clipboard.writeText(selection).catch(() => {});
				this.terminal?.clearSelection();
				return false;
			}
			return true;
		}
		if (e.key === 'v') {
			// Return false to suppress the raw keycode being sent to the PTY.
			// xterm's native paste event listener handles the actual paste.
			return false;
		}
		return null;
	}

	private applyShiftArrowStep(key: string): boolean {
		if (!this.terminal) return true;
		const cols = this.terminal.cols;
		const buffer = this.terminal.buffer.active;

		// Compare positions linearly (row * cols + col) to detect side-of-anchor before moving
		const anchorLinear = this.selectionAnchor!.row * cols + this.selectionAnchor!.col;
		const oldActiveLinear = this.selectionActive!.row * cols + this.selectionActive!.col;

		// Left/Right wrap across row boundaries (treating the buffer as a continuous
		// character stream), while Up/Down intentionally preserve the column. Column
		// preservation matches most editors' vertical movement semantics, and because
		// xterm's buffer is a fixed-width grid every row is `cols` wide, so "landing
		// past end-of-content" is a non-issue here — every column is a valid cell.
		let { col, row } = this.selectionActive!;
		switch (key) {
			case 'ArrowRight':
				col++;
				if (col >= cols) { col = 0; row++; }
				break;
			case 'ArrowLeft':
				col--;
				if (col < 0) { col = cols - 1; row--; }
				break;
			case 'ArrowDown': row++; break;
			case 'ArrowUp':   row--; break;
		}
		row = Math.max(0, Math.min(buffer.length - 1, row));
		col = Math.max(0, Math.min(cols - 1, col));

		const newActiveLinear = row * cols + col;

		// Two scenarios to handle here:
		//
		// 1. Restore after zero-crossing: if the active position has returned exactly to
		//    the current anchor AND we have a saved pre-flip anchor from an earlier crossing,
		//    restore the original anchor instead of collapsing to zero. This makes
		//    "shift+up then shift+down" return to the original selection, matching most
		//    editors. Without this, the selection would collapse because anchor === active.
		//
		// 2. Flip on crossing: when active strictly crosses the anchor (not merely reaches
		//    it), re-anchor at the old active position and save the pre-flip anchor for a
		//    potential future restore. This mirrors editor behaviour where reversing direction
		//    past the fixed end re-anchors at the far side of the selection.
		//
		// The XOR-style check in branch 2 fires when the side-of-anchor changed between old
		// and new active positions — e.g. old was right of anchor (true) and new is left of
		// anchor (false), or vice versa. Same side on both = no crossing, no flip.
		//
		// Note on selectionPreviousAnchor lifetime: if the user flips, then moves further in
		// the same direction instead of returning (e.g. shift+up, shift+up), the saved anchor
		// remains valid — it still points at the original far end, and a later return to the
		// current anchor will restore it correctly.
		if (newActiveLinear === anchorLinear && this.selectionPreviousAnchor) {
			this.selectionAnchor = this.selectionPreviousAnchor;
			this.selectionPreviousAnchor = null;
		} else if (newActiveLinear !== anchorLinear && (oldActiveLinear > anchorLinear) !== (newActiveLinear > anchorLinear)) {
			this.selectionPreviousAnchor = this.selectionAnchor;
			this.selectionAnchor = { col: this.selectionActive!.col, row: this.selectionActive!.row };
		}

		this.selectionActive = { col, row };

		const anchor = this.selectionAnchor!;
		const active = this.selectionActive;
		let startCol: number, startRow: number, endCol: number, endRow: number;
		if (anchor.row < active.row || (anchor.row === active.row && anchor.col <= active.col)) {
			startCol = anchor.col; startRow = anchor.row;
			endCol = active.col;   endRow = active.row;
		} else {
			startCol = active.col; startRow = active.row;
			endCol = anchor.col;   endRow = anchor.row;
		}

		const length = (endRow - startRow) * cols + (endCol - startCol);
		this.isUpdatingSelection = true;
		if (length > 0) {
			this.terminal.select(startCol, startRow, length);
		} else {
			this.terminal.clearSelection();
		}
		this.isUpdatingSelection = false;
		return false;
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

	// Option B: TUI entered the alternate screen buffer — the app is rendering.
	// Option A fallback: strip ANSI escape sequences; if visible text remains,
	//                    the process has produced real output.
	private isReadyToShow(data: string): boolean {
		if (data.includes(ClaudeTerminalView.ESC + '[?1049h')) return true;
		return /\S/.test(data.replace(ClaudeTerminalView.ANSI_RE, ''));
	}

	private showError(message: string, details?: string): void {
		if (!this.termEl || !this.errorEl) return;
		if (this.loadingEl) this.loadingEl.style.display = 'none';
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
			await this.relaunch();
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
