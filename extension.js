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

function getStatusBarValue(tbl, key) {
    if (("options" in tbl) && ("statusbar" in tbl.options) && (key in tbl.options.statusbar)) {
        return tbl.options.statusbar[key];
    }
    return undefined;
}

function getStatusBarPlat(tbl, key) {
    let plat = getPlatKV(tbl);
    if (typeof plat == "object") {
        let res = getStatusBarValue(plat, key);
        if (res !== undefined) {
            return res;
        }
    }
    return getStatusBarValue(tbl, key);
}

function getStatusBar(task, global, key) {
    let res = getStatusBarPlat(task, key);
    if (res !== undefined) {
        return res;
    }
    res = getStatusBarPlat(global, key);
    if (res !== undefined) {
        return res;
    }
    const settings = vscode.workspace.getConfiguration("tasks.default.statusbar");
    if (settings !== undefined) {
        return settings[key];
    }
    return undefined;
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
    else if (Array.isArray(command)) {
        var cmds;
        for (var c of command) {
            if (typeof c == "string") {
                if (cmds === undefined) {
                    cmds = c;
                }
                else {
                    cmds += ' ' + c;
                }
            }
        }
        if (cmds !== undefined) {
            props.push(cmds);
        }
    }
    if (Array.isArray(args) && args.length > 0) {
        for (var arg of args) {
            if (typeof arg == "string") {
                props.push(arg);
            } else if (typeof arg == "object") {
                props.push(arg.value);
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

    let statusBarInfo = {}
    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        const config = vscode.workspace.getConfiguration('tasks', workspaceFolder.uri);
        if (!config || !Array.isArray(config.tasks)) {
            continue;
        }
        for (const task of config.tasks) {
            let taskId = computeId(task, config);
            statusBarInfo[taskId] = {
                hide: getStatusBar(task, config, "hide"),
                label: getStatusBar(task, config, "label"),
                tooltip: getStatusBar(task, config, "tooltip"),
                color: getStatusBar(task, config, "color"),
            }
        }
    }

    vscode.tasks.fetchTasks().then((tasks) => {
        for (const task of tasks) {
            let taskId = task.name + ',' + task.definition.id;
            let info = statusBarInfo[taskId]
            if (task.source != "Workspace" || !info || info.hide) {
                continue;
            }
            let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
            let command = "actboy168.task." + statusBarIndex++;
            statusBar.text = info.label || task.name;
            statusBar.tooltip = info.tooltip || task.detail;
            if (typeof info.color == "string") {
                if (info.color.slice(0,1) === "#") {
                    statusBar.color = info.color;
                }
                else {
                    statusBar.color = vscode.ThemeColor(info.color);
                }
            }
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
