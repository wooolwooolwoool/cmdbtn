import * as vscode from 'vscode';

const STORAGE_KEY = 'commandSidebarState';

export function activate(context: vscode.ExtensionContext) {
  console.log("Activeating Command Sidebar Extension");
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "commandSidebar",
      new CommandSidebarProvider(context.extensionUri, context)
    )
  );
}

class CommandSidebarProvider implements vscode.WebviewViewProvider {
  public webview: vscode.Webview | null = null;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext // context を受け取る
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.webview = webviewView.webview;
    webviewView.webview.options = {
      enableScripts: true,
      // Restrict the webview to only load resources from the `dist` and `webview-ui/build` directories
      localResourceRoots: [this._extensionUri],
    };

    // 保存されていれば復元
    const saved = this.context.workspaceState.get(STORAGE_KEY);
    const defalutcommandJson: Record<string, { type: string, cmds: any; openclose: string }> = {
      "Group_simple": {
        "type": "simple",
        "cmds": {
          "Docker run1": ["docker_run sample1_1", "docker_run sample1_2"],
          "Docker stop1": "docker_stop sample1"
        },
        "openclose": "open"
      },
      "Group_custom": {
        "type": "custom",
        "cmds": {
          "Docker run2" :{
            "cmd": "docker_run sample2",
            "color": "white",
            "background-color": "blue",
            "padding": "4",
            "font-size": "2em"
          },
          "Docker stop2_default" :{
            "cmd": "docker_run stop2"
          }
        },
        "openclose": "close"
      }
    };
    let commandJson: Record<string, { cmds: Record<string, string>; openclose: string }> = defalutcommandJson;
    try {
      webviewView.webview.html = getHtml(webviewView.webview, JSON.parse(JSON.stringify(saved)));
      commandJson = saved as typeof defalutcommandJson;
    } catch (e) {
      console.error("Error generating HTML:", e);
      vscode.window.showErrorMessage('Failed to load command sidebar. Load default commands.');
      try {
        webviewView.webview.html = getHtml(webviewView.webview, defalutcommandJson);
      } catch (e) {
        console.error("Error generating HTML:", e);
      }
    }

    console.log("Command JSON:", commandJson);
    this.webview.onDidReceiveMessage(message => {
    });

    webviewView.webview.onDidReceiveMessage(message => {
      if (this.webview === null) {
        console.error("Webview is null, cannot process message.");
        return;
      }
      if (message.command) {
        const cmd = message.command;
        const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal();
        terminal.show();
        if (Array.isArray(cmd)) {
          // 複数コマンドを順に送信
          cmd.forEach((c) => {
            terminal.sendText(c);
            console.log(`Command sent seq: ${c}`);
          });
        } else {
          // 単一コマンド
          terminal.sendText(cmd);
          console.log(`Command sent: ${cmd}`);
        }
      } else if (message.export) {
        this.webview.postMessage({ type: 'export', data: JSON.stringify(commandJson, null, 1) });
      } else if (message.import) {
        try {
          console.log("Importing JSON:", message.data);
          const parsed = JSON.parse(message.data);
          commandJson = parsed; // 更新
          this.webview.html = getHtml(this.webview, parsed); // 更新
          this.context.workspaceState.update(STORAGE_KEY, parsed); // 保存
        } catch (e) {
          vscode.window.showErrorMessage('Failed to import');
          console.error("Error parsing JSON:", e);
        }
      } else if (message.open) {
        const groupName = message.open;
        console.log(`Opening group: ${groupName}`);
        commandJson[groupName].openclose = "open";
        this.context.workspaceState.update(STORAGE_KEY, commandJson);
      } else if (message.close) {
        const groupName = message.close;
        console.log(`Closeing group: ${groupName}`);
        commandJson[groupName].openclose = "close";
        this.context.workspaceState.update(STORAGE_KEY, commandJson);
      }
    });
  }
}


function getHtml(webview: vscode.Webview, commandJson: any): string {
  const commands = Object.entries(commandJson).map(([group, items]: [string, any]) => {
    if (items["type"] === "simple" || items["type"] === undefined) {
      var buttons = "";
      Object.entries(items["cmds"]).forEach(([k, v]) => {
          const cmdJson = JSON.stringify(v); // 配列でも文字列でもOK
          buttons += `<div class="btn"><button class="button00" onclick='runCommand(${cmdJson})'>${k}</button></div>`;
        })
      return `<details ${items["openclose"]}><summary>${group}</summary>${buttons}</details>`;
    } else if (items["type"] === "custom") {
      var buttons = "";
      Object.entries(items["cmds"]).map(([k, item]: [string, any]) => {
          var v = item["cmd"];
          var setting: Record<string, string> = { /* default value */
            "color": "black",
            "background-color": "white",
            "font-size": "1em"
          }
          Object.entries(item).map(([kk, vv]: [string, any]) => {
            setting[kk] = vv;
          })
          var style = "";
          Object.entries(setting).forEach(([kk, vv]) => {
            style += `${kk}:${vv};`;
          })
          buttons += `<div class="btn"><button class="button00_color" style="${style}" onclick="runCommand('${v}')">${k}</button></div>`;
        })
      return `<details ${items["openclose"]}><summary>${group}</summary>${buttons}</details>`;
    } else {
      console.error(`Unknown command type found: ${items["type"]} in command JSON. Ignoring it.`);
      vscode.window.showErrorMessage(`Unknown command type found: ${items["type"]} in command JSON. Ignoring it.`);
      return `<details ${items["openclose"]}><summary>${group}</summary>Unknown type</details>`;
    }
  });

  return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        button { margin: 4px 0; display: block; width: 100%; }
        summary { font-weight: bold; cursor: pointer; }
        .btn{
          text-align: center;
        }
        .button00 {
          background-color: #fff;
          border: solid 1px #2f4f4f;
          color: black;
          width: 100%;
          padding: 2px;
          text-decoration: none;
          font-size: 1em;
        }
        .button00:hover {
          color: #2f4f4f;
          background-color: #b0e0e6;
        }
        .button00_color {
          border: solid 1px #2f4f4f;
          width: 100%;
          padding: 2px;
          text-decoration: none;
        }
        .button00_color:hover {
          color: #2f4f4f;
          background-color: #b0e0e6;
        }
      </style>
    </head>
    <body>
      ${commands.join("<br>")}
      <hr>
      <details close><summary>Edit</summary>
        <textarea id="jsonEditor" style="width: 100%; height: 100px;"></textarea><br>
        <button onclick="importJson()">Import</button>
      </details>
      <script>
        const vscode = acquireVsCodeApi();
        function runCommand(cmd) {
          vscode.postMessage({ command: cmd });
        }

        function exportJson() {
          vscode.postMessage({ export: true });
        }

        function importJson() {
          const data = document.getElementById('jsonEditor').value;
          vscode.postMessage({ import: true, data });
        }

        document.querySelectorAll('details').forEach(details => {
          const summaryText = details.querySelector('summary').textContent;

          details.addEventListener('toggle', () => {
            if (details.open) {
              vscode.postMessage({ open: \`\${summaryText}\` });
            } else {
              vscode.postMessage({ close: \`\${summaryText}\` });
            }
          });
        });

        // Webviewからのメッセージ受信
        window.addEventListener('message', event => {
          const message = event.data;
          if (message.type === 'export') {
            document.getElementById('jsonEditor').value = message.data;
          } else if (message.type === 'import') {
            exportJson();
          }
        });
        exportJson();
      </script>
    </body>
    </html>
  `;
}
