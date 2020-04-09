const vscode = require('vscode');
const os = require('os');

var statusBarArray = [];
var taskMap = {};
var outputChannel;
const RunTaskCommand = "actboy168.run-task"

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
    if (typeof name != "string") {
        name = script;
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
            return color;
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

function createTasks(context, config) {
    for (const taskCfg of config.tasks) {
        let taskId = computeId(taskCfg, config);
        let task = taskMap[taskId];
        if (!task) {
            continue;
        }
        taskMap[taskId] = undefined;
        let hide = getStatusBar(taskCfg, config, "hide");
        if (hide) {
            continue;
        }
        let label = getStatusBar(taskCfg, config, "label");
        let tooltip = getStatusBar(taskCfg, config, "tooltip");
        let color = getStatusBar(taskCfg, config, "color");
        let filePattern = getStatusBar(taskCfg, config, "filePattern");
        let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
        statusBar.text = label || task.name;
        statusBar.tooltip = tooltip || task.detail;
        statusBar.color = convertColor(color);
        statusBar.filePattern = filePattern;
        statusBar.command = {
            command: RunTaskCommand,
            arguments: [task]
        };
        statusBarArray.push(statusBar);
        context.subscriptions.push(statusBar);
    }
}

function loadTasks(context) {
    deactivate(context)
    if (vscode.workspace.workspaceFolders === undefined) {
        return;
    }

    vscode.tasks.fetchTasks().then((tasks) => {
        taskMap = {};
        for (const task of tasks) {
            if (task.source != "Workspace") {
                continue;
            }
            let taskId = task.name + ',' + getTaskId(task);
            taskMap[taskId] = task;
        }
        const configuration = vscode.workspace.getConfiguration();
        if (configuration) {
            const tasksJson = configuration.inspect('tasks');
            if (tasksJson) {
                const config = tasksJson.globalValue;
                if (config && Array.isArray(config.tasks)) {
                    createTasks(context, config);
                }
            }
        }
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const configuration = vscode.workspace.getConfiguration(null, workspaceFolder.uri);
            if (configuration) {
                const tasksJson = configuration.inspect('tasks');
                if (tasksJson) {
                    const config = tasksJson.workspaceFolderValue;
                    if (config && Array.isArray(config.tasks)) {
                        createTasks(context, config);
                    }
                }
            }
        }
        syncStatusBarItemsWithActiveEditor();
    });
}

function activate(context) {
    outputChannel = vscode.window.createOutputChannel("VSCode Tasks");
    context.subscriptions.push(vscode.commands.registerCommand(RunTaskCommand, (task) => {
        vscode.tasks.executeTask(task).catch((err)=>{
            vscode.window.showWarningMessage(err.message).then(_ => undefined);
        });
    }));
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
