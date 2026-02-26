## 🚀 快速开始 --- 飞书

### 配置文件

飞书配置从独立配置文件读取，创建 `~/.config/opencode/plugins/feishu.json`：

```json
{
  "app_id": "cli_xxxxxxx",
  "app_secret": "xxxxxxxxxx",
  "mode": "ws"
}
```

**完整配置项：**

| 配置项 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `app_id` | 是 | - | 飞书应用 ID |
| `app_secret` | 是 | - | 飞书应用密钥 |
| `mode` | 否 | `ws` | 连接模式：`ws` 或 `webhook` |
| `callback_url` | webhook 模式时必需 | - | Webhook 回调地址 |
| `encrypt_key` | 否 | - | 加密密钥 |
| `file_store_dir` | 否 | - | 文件存储目录 |
| `auto_send_local_files` | 否 | `false` | 自动发送本地文件 |
| `auto_send_local_files_allow_absolute` | 否 | `false` | 允许绝对路径 |
| `auto_send_local_files_max_mb` | 否 | `20` | 最大文件大小(MB) |

### Opencode 配置 (`opencode.json`)

只需要在 plugin 中引用本插件即可：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/your/path/opencode-feishu"]
}
```

插件会自动读取 `~/.config/opencode/plugins/feishu.json` 配置。

### 访问 [飞书开放平台](https://open.feishu.cn/app?lang=zh-CN)

1. #### 创建企业自建应用

2. #### 🔒权限管理 -> 批量导入/导出权限 -> 导入 -> 复制下列权限 -> 确认新增权限

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

3. #### ➕事件与回调 -> 事件配置 -> 添加事件 -> `im.message.receive_v1` -> 确认添加

   **所需权限：**

   - 读取用户发给机器人的单聊消息 

   - 接收群聊中@机器人消息事件

4. #### 启动 `opencode`

   ```shell
   opencode web
   ```

5. #### ➕事件与回调 -> 事件配置 -> 订阅方式

   1. 如果是Webhook 模式

      - 选择：将事件发送至 **开发者服务器**

        - 如果你有服务器，直接上域名

        - 如果你没有服务器: 推荐使用 `cloudflared` cli （请自行查阅安装方法）

          ```shell
          cloudflared tunnel --url http://127.0.0.1:3000 // 和你的callback_url 保持一致
          ```

        - 从`log`中找到url
        
          ```
          ➜  opencode cloudflared tunnel --url http://127.0.0.1:3000
          2026-02-05T12:32:30Z INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment and try it out. However, be aware that these account-less Tunnels have no uptime guarantee, are subject to the Cloudflare Online Services Terms of Use (https://www.cloudflare.com/website-terms/), and Cloudflare reserves the right to investigate your use of Tunnels for violations of such terms. If you intend to use Tunnels in production you should use a pre-created named tunnel by following: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps
          2026-02-05T12:32:30Z INF Requesting new quick Tunnel on trycloudflare.com...
          2026-02-05T12:32:35Z INF +--------------------------------------------------------------------------------------------+
          2026-02-05T12:32:35Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
          2026-02-05T12:32:35Z INF |  https://truly-muslim-jpeg-shareholders.trycloudflare.com                                  |
          ```
        
        - 填入**请求地址**中 （注意opencode需在运行中）
        
        - 点击保存

   2. 如果是WebSocket 模式，直接点击保存

6. #### ➕事件与回调 -> 事件配置 -> 回调配置 

      操作同上



---