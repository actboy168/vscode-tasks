const vscode = require('vscode');
const os = require('os');

var statusBarArray = [];
var commandMap = {};
var outputChannel;

function deactivate(context) {
    statusBarArray.forEach(i => {
        i.dispose();
    });
    statusBarArray = [];
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
    if (("options" in tbl) && (typeof tbl.options === 'object')
        && ("statusbar" in tbl.options) && (typeof tbl.options.statusbar === 'object')
        && (key in tbl.options.statusbar)) {
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

function computeIdForNpm(task, config, name) {
    let script = getValue(task, config, "script");
    if (typeof script != "string") {
        script = "";
    }
    return name+",vscode.npm.script,"+script+",type,npm,";
}

function computeId(task, config) {
    const name    = "label" in task ? task.label : task.taskName;
    const type    = getValue(task, config, "type");
    if (type == "npm") {
        return computeIdForNpm(task, config, name);
    }
    const props = [];
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

function getTaskId(task) {
    if (task.definition.type == "npm") {
        return task._id;
    }
    return task.definition.id;
}

function convertColor(color) {
    if (typeof color == "string") {
        if (color.slice(0,1) === "#") {
            return info.color;
        }
        else {
            return vscode.ThemeColor(color);
        }
    }
    return undefined;
}

function syncStatusBarItemsWithActiveEditor() {
    for (let statusBar of statusBarArray) {
        if (!statusBar) {
            continue;
        }
        statusBar.hide();
        let currentFilePath = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.fileName,
            filePattern = statusBar.filePattern,
            showStatusBarItem = false;
        try {
            showStatusBarItem = !filePattern || (currentFilePath && new RegExp(statusBar.filePattern).test(currentFilePath));
        } catch (error) {
            outputChannel.appendLine(`Error validating status bar item '${statusBar.text}' filePattern for active file '${currentFilePath}'. ${error.name}: ${error.message}`);
        }
        if (showStatusBarItem) {
            statusBar.show();
        }
    }
}

function loadTasks(context) {
    deactivate(context)
    if (vscode.workspace.workspaceFolders === undefined) {
        return;
    }

    let statusBarInfo = {}
    let statusBarIndex = 0;
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
                filePattern: getStatusBar(task, config, "filePattern"),
            }
        }
    }

    vscode.tasks.fetchTasks().then((tasks) => {
        for (const task of tasks) {
            if (task.source != "Workspace") {
                continue;
            }
            let taskId = task.name + ',' + getTaskId(task);
            let info = statusBarInfo[taskId] || {}
            if (info.hide) {
                continue;
            }
            let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
            let command = "actboy168.task." + statusBarIndex++;
            statusBar.text = info.label || task.name;
            statusBar.tooltip = info.tooltip || task.detail;
            statusBar.color = convertColor(info.color);
            statusBar.filePattern = info.filePattern;
            statusBar.command = command;
            statusBarArray.push(statusBar);
            context.subscriptions.push(statusBar);
            if (!(command in commandMap)) {
                context.subscriptions.push(vscode.commands.registerCommand(command, () => {
                    vscode.tasks.executeTask(commandMap[command]).catch((e)=>{
                        console.error(e)
                    });
                }));
            }
            commandMap[command] = task;
        }
    }).then(() => {
        syncStatusBarItemsWithActiveEditor();
    });
}

function activate(context) {
    outputChannel = vscode.window.createOutputChannel("VSCode Tasks");
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        loadTasks(context);
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        loadTasks(context);
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        syncStatusBarItemsWithActiveEditor();
    }));
    loadTasks(context);
}

exports.activate = activate;
exports.deactivate = deactivate;
