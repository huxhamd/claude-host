'use strict';
const path = require('path');
const pty = require(path.join(__dirname, 'node_modules', 'node-pty'));

const cols = parseInt(process.argv[2]) || 80;
const rows = parseInt(process.argv[3]) || 24;
const cwd = process.argv[4] || process.cwd();
// Spawn claude directly so the process exits when claude exits,
// with no underlying shell left accessible.
const [shell, args] = process.platform === 'win32'
    ? ['cmd.exe', ['/c', 'claude']]
    : [process.env.SHELL || '/bin/bash', ['-c', 'claude']];

const ptyProcess = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: process.env,
    useConpty: true,
});

// stdout → parent: [4-byte big-endian length][utf-8 data]
function writeOutput(data) {
    const dataBuf = Buffer.from(data, 'utf8');
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(dataBuf.length, 0);
    process.stdout.write(Buffer.concat([header, dataBuf]));
}

ptyProcess.onData((data) => writeOutput(data));

ptyProcess.onExit(({ exitCode }) => process.exit(exitCode ?? 0));

// stdin ← parent message format:
//   type 0 (input):  [0x00][4-byte length][utf-8 data]
//   type 1 (resize): [0x01][uint16 cols][uint16 rows]
let buf = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    while (buf.length >= 1) {
        const type = buf[0];

        if (type === 0) {
            if (buf.length < 5) break;
            const len = buf.readUInt32BE(1);
            if (buf.length < 5 + len) break;
            ptyProcess.write(buf.slice(5, 5 + len).toString('utf8'));
            buf = buf.slice(5 + len);
        } else if (type === 1) {
            if (buf.length < 5) break;
            ptyProcess.resize(buf.readUInt16BE(1), buf.readUInt16BE(3));
            buf = buf.slice(5);
        } else {
            buf = buf.slice(1);
        }
    }
});

process.stdin.on('end', () => {
    ptyProcess.kill();
    process.exit(0);
});
