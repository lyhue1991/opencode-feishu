
# 🚀 Quick Start --- Lark (Feishu)

## ⚙️ Opencode Configuration (`opencode.json`)

> **Note:** It is strongly recommended to use the **String** type for all configuration items to avoid parsing issues.

### Lark (Webhook Mode)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["message-bridge-opencode-plugin"], // Due to official issues, use [/your/path/message-bridge-opencode-plugin]
  "agent": {
    "lark-bridge": {
      "disable": false,
      "description": "Message Bridge Plugin",
      "options": {
        "platform": "feishu",
        "mode": "webhook",
        "app_id": "cli_xxxxxxx",
        "app_secret": "xxxxxxxxxx",
        "callback_url": "127.0.0.1:3000"
      }
    }
  }
}

```

### Lark (WebSocket Mode)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["message-bridge-opencode-plugin"], // Due to official issues, use [/your/path/message-bridge-opencode-plugin]
  "agent": {
    "lark-bridge": {
      "disable": false,
      "description": "Message Bridge Plugin",
      "options": {
        "platform": "feishu",
        "mode": "ws",
        "app_id": "cli_xxxxxxx",
        "app_secret": "xxxxxxxxxx"
      }
    }
  }
}

```

---

## ⚙️ Lark Developer Console Configuration

1. Visit the [Lark Open Platform](https://open.larksuite.com/app).
2. Create a **Custom App**.

### 🔒 Permission Management

Go to **Permission Management** -> **Bulk Import/Export** -> **Import** -> Paste the following permissions -> **Confirm**.

```json
{
  "scopes": {
    "tenant": [
      "im:chat:readonly",
      "im:message",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly",
      "im:resource"
    ],
    "user": []
  }
}

```

### ➕ Events and Callbacks

1. Go to **Event Configuration** -> **Add Events**.
2. Add `im.message.receive_v1` and confirm.
3. **Required Permissions:**
* Read private messages sent by users to the bot.
* Receive @bot message events in group chats.



---

## 🚀 Launching Opencode

1. Start **opencode** or **opencode web**.
2. Go to **Events and Callbacks** -> **Event Configuration** -> **Subscription Method**.

### Case A: Webhook Mode

* Select: **Send events to developer server**.
* **If you have a server:** Enter your domain directly.
* **If you don't have a server:** Use the `cloudflared` CLI (refer to official docs for installation).

Run the following command (ensure it matches your `callback_url`):

```bash
cloudflared tunnel --url http://127.0.0.1:3000

```

Locate the URL in the logs:

```text
2026-02-05T12:32:35Z INF | Your quick Tunnel has been created! Visit it at: |
2026-02-05T12:32:35Z INF | https://truly-muslim-jpeg-shareholders.trycloudflare.com |

```

* Paste this URL into the **Request URL** field (Ensure Opencode is running).
* Click **Save**.

### Case B: WebSocket Mode

* Simply click **Save**.

### Callback Configuration

* Go to **Events and Callbacks** -> **Callback Configuration**.
* Follow the same steps as above for the setup.