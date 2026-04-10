export interface ClaudeHostSettings {
	fontSize:   number;
	fontFamily: string;
	scrollback: number;
}

export const DEFAULT_SETTINGS: ClaudeHostSettings = {
	fontSize:   13,
	fontFamily: 'Cascadia Code',
	scrollback: 5000,
};

// fontFamily stores the display name; this map resolves it to a CSS font-family stack.
export const FONT_FAMILY_OPTIONS: Record<string, string> = {
	'Cascadia Code':   '"Cascadia Code", monospace',
	'Consolas':        'Consolas, monospace',
	'Source Code Pro': '"Source Code Pro", monospace',
};
