const vscode = require('vscode');
const os = require('os');

var statusBarArray = [];
var statusBarIndex = 0;
var commandMap = {};

function deactivate(context) {
    statusBarArray.forEach(i => {
        i.dispose();
    });
    statusBarArray = [];
    statusBarIndex = 0;
}

function getPlatKV(t) {
    if (os.platform() == "win32") {
        return t.windows
    }
    else if (os.platform() == "darwin") {
        return t.osx
    }
    else {
        return t.linux
    }
}

function getValue(t, g, k) {
    let pt = getPlatKV(t);
    if (typeof pt == 'object' && k in pt) {
        return pt[k];
    }
    if (k in t) {
        return t[k];
    }
    let gt = getPlatKV(g);
    if (typeof gt == 'object' && k in gt) {
        return gt[k];
    }
    if (k in g) {
        return g[k];
    }
}

function getValue2(t, g, k1, k2) {
    let pt = getPlatKV(t);
    if (typeof pt == 'object' && k1 in pt && k2 in pt[k1]) {
        return pt[k1][k2];
    }
    if (k1 in t && k2 in t[k1]) {
        return t[k1][k2];
    }
    let gt = getPlatKV(g);
    if (typeof gt == 'object' && k1 in gt && k2 in gt[k1]) {
        return gt[k1][k2];
    }
    if (k1 in g && k2 in g[k1]) {
        return g[k1][k2];
    }
}

function computeTaskExecutionId(values) {
	let id = '';
	for (let i = 0; i < values.length; i++) {
		id += values[i].replace(/,/g, ',,') + ',';
	}
	return id;
}

function computeId(task, config) {
    const props = [];
    const name    = "label" in task ? task.label : task.taskName;
    const type    = getValue(task, config, "type");
    const command = getValue(task, config, "command");
    const args    = getValue(task, config, "args");
    if (typeof name == "string") {
        props.push(name);
    }
    if (typeof type == "string") {
        props.push(type);
    }
    if (typeof command == "string") {
        props.push(command);
    }
    if (Array.isArray(args) && args.length > 0) {
        for (var arg of args) {
            if (typeof arg == "string") {
                props.push(arg);
            }
        }
    }
    return computeTaskExecutionId(props);
}

function loadTasks(context) {
    deactivate(context)
    if (vscode.workspace.workspaceFolders === undefined) {
        return;
    }

    let hide = {}
    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        const config = vscode.workspace.getConfiguration('tasks', workspaceFolder.uri);
        if (!config || !Array.isArray(config.tasks)) {
            continue;
        }
        for (const task of config.tasks) {
            if (getValue2(task, config, "options", "statusbar") == "hide") {
                hide[computeId(task, config)] = true;
            }
        }
    }

    vscode.tasks.fetchTasks().then((tasks)=>{
        for (const task of tasks) {
            let name = task.name;
            let taskId = task.definition.id;
            if (task.source != "Workspace" || hide[task.name+','+taskId]) {
                continue;
            }
            let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 51);
            let command = "actboy168.task." + statusBarIndex++;
            statusBar.text = name;
            statusBar.command = command;
            statusBar.show();
            statusBarArray.push(statusBar);
            context.subscriptions.push(statusBar);
            if (!(command in commandMap)) {
                context.subscriptions.push(vscode.commands.registerCommand(command, () => {
                    vscode.tasks.executeTask(commandMap[command]);
                }));
            }
            commandMap[command] = task;
        }
    });
}

function activate(context) {
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        loadTasks(context);
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        loadTasks(context);
    }));
    loadTasks(context);
}

exports.activate = activate;
exports.deactivate = deactivate;
