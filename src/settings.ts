export interface ClaudeHostSettings {
	fontSize:  number;
	scrollback: number;
	claudeArgs: string;
}

export const DEFAULT_SETTINGS: ClaudeHostSettings = {
	fontSize:  13,
	scrollback: 5000,
	claudeArgs: '',
};
