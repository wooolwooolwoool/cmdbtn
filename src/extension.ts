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
    var defalutcommandJson = {
      Group1: [
        { "Docker run1": "docker run sample1" },
        { "Docker stop1": "docker stop sample1" }
      ],
      Group2: [
        { "Docker run2": "docker run sample2" },
        { "Docker stop2": "docker stop sample2" }
      ]
    };
    var commandJson = defalutcommandJson;
    try {
      webviewView.webview.html = getHtml(webviewView.webview, JSON.parse(JSON.stringify(saved)));
      commandJson = saved as typeof defalutcommandJson;
    }
    catch (e) {
      console.error("Error generating HTML:", e);
      vscode.window.showErrorMessage('Failed to load command sidebar. Load default commands.');
      webviewView.webview.html = getHtml(webviewView.webview, defalutcommandJson);
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
          vscode.window.showErrorMessage('Invalid JSON');
          console.error("Error parsing JSON:", e);
        }
      }
    });
  }
}


function getHtml(webview: vscode.Webview, commandJson: any): string {
  const commands = Object.entries(commandJson).map(([group, items]: [string, any]) => {
    const buttons = items
      .map((item: any) => {
        const label = Object.keys(item)[0];
        const cmd = item[label];
        return `<div class="btn"><a class="button00" onclick="runCommand('${cmd}')">${label}</a></div>`;
      })
      .join("");
    return `<details open><summary>${group}</summary>${buttons}</details>`;
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
          border: solid 2px #2f4f4f;
          color: black;
          width: 100%;
          display:block;
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
        <button onclick="exportJson()">Export</button>
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

        // Webviewからのメッセージ受信
        window.addEventListener('message', event => {
          const message = event.data;
          if (message.type === 'export') {
            document.getElementById('jsonEditor').value = message.data;
          }
        });
      </script>
    </body>
    </html>
  `;
}
