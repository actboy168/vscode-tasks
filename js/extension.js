const vscode = require('vscode');

var statusBarArray = [];
var taskMap = {};

function activate(context) {
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        loadTasks(context);
    }));
    statusBarArray = [];
    taskMap = {};
    loadTasks(context);
}
exports.activate = activate;

function deactivate() {
}
exports.deactivate = deactivate;

function loadTasks(context) {
    statusBarArray.forEach(i => {
        i.hide();
    });
    statusBarArray = [];
    const config = vscode.workspace.getConfiguration('tasks', vscode.window.activeTextEditor.document.uri);
    if (!config || !Array.isArray(config.tasks)) {
        return;
    }
    for (const task of config.tasks) {
        const name = "label" in task ? task.label : task.taskName;
        if (typeof name != 'string') {
            continue;
        }
        let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        statusBar.text = name;
        statusBar.command = "actboy168.task-" + name;
        statusBar.show();
        statusBarArray.push(statusBar);
        context.subscriptions.push(statusBar);
        if (!(name in taskMap)) {
            context.subscriptions.push(vscode.commands.registerCommand(statusBar.command, () => {
                vscode.commands.executeCommand("workbench.action.tasks.runTask", name);
            }));
        }
        taskMap[name] = true
    }
}
