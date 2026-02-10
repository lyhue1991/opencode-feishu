# Release Note

## Feishu Only Version

This is a simplified version that only supports Feishu (Lark) platform.
Telegram and iMessage adapters have been removed.

---

## Features (Feishu)

- Webhook and WebSocket modes
- Incoming message handling
- Message send/edit pipeline
- Slash-command bridge flow
- File upload/download support
- Local file return via `/sendfile`
- Direct file save via `/savefile`

---

## Supported Commands

- `/help` - list custom commands
- `/models` - list providers and models
- `/new` - create and bind to a new session
- `/rename <title>` - rename current session
- `/abort` - force-abort current session generation
- `/reset` / `/restart` - reset bridge runtime state
- `/status` - show runtime status
- `/sessions` - list and switch sessions
- `/sessions delete ...` - batch delete sessions
- `/maxFileSize <xmb>` - set upload file size limit
- `/maxFileRetry <n>` - set resource download retry count
- `/savefile` - save uploaded file directly to local path
- `/sendfile <path>` - force-send a local file back via bot
- `/share` / `/unshare`
- `/compact` (alias `/summarize`)
- `/init`
- `/agent` - list and switch agents

---

## Configuration

See `config-guide/lark/GUIDE.md` for Feishu configuration guide.

---

## License

MIT License
