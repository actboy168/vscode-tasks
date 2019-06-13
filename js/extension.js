const vscode = require('vscode');

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

function computeTaskExecutionId(values) {
	let id = '';
	for (let i = 0; i < values.length; i++) {
		id += values[i].replace(/,/g, ',,') + ',';
	}
	return id;
}

function computeId(task) {
    const props = [];
    if (typeof task.type == "string") {
        props.push(task.type);
    }
    if (typeof task.command == "string") {
        props.push(task.command);
    }
    if (Array.isArray(task.args) && task.args.length > 0) {
        for (var arg of task.args) {
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
            if ((task.options && task.options.statusbar == 'hide') || (config.options && config.options.statusbar == 'hide')) {
                for (var key of ["type", "command", "args"]) {
                    if (key in config && !(key in task)) {
                        task[key] = config[key];
                    }
                }
                hide[computeId(task)] = true;
            }
        }
    }

    vscode.tasks.fetchTasks().then((tasks)=>{
        for (const task of tasks) {
            let name = task.name;
            let taskId = task.definition.id;
            if (task.source != "Workspace" || hide[taskId]) {
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
