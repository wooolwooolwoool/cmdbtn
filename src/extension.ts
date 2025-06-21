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
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext // context を受け取る
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    const webview = webviewView.webview;
    webviewView.webview.options = {
      enableScripts: true
    };

    // 保存されていれば復元
    const saved = this.context.workspaceState.get(STORAGE_KEY);
    const defalutcommandJson: Record<string, { cmds: Record<string, string>; openclose: string }> = {
      "Group1": {
        "cmds": {
          "Docker run1": "docker run sample1",
          "Docker stop1": "docker stop sample1"
        },
        "openclose": "open"
      },
      "Group2": {
        "cmds": {
          "Docker run2": "docker run sample2",
          "Docker stop2": "docker stop sample2"
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
    webview.onDidReceiveMessage(message => {
    });

    webviewView.webview.onDidReceiveMessage(message => {
      if (message.command) {
        const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal();
        terminal.show();
        terminal.sendText(message.command);
      } else if (message.export) {
        webview.postMessage({ type: 'export', data: JSON.stringify(commandJson, null, 1) });
      } else if (message.import) {
        try {
          console.log("Importing JSON:", message.data);
          const parsed = JSON.parse(message.data);
          commandJson = parsed; // 更新
          webview.html = getHtml(webview, parsed); // 更新
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
    var buttons = "";
    Object.entries(items["cmds"]).forEach(([k, v]) => {
        buttons += `<div class="btn"><button class="button00" onclick="runCommand('${v}')">${k}</button></div>`;
      })
    return `<details ${items["openclose"]}><summary>${group}</summary>${buttons}</details>`;
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
