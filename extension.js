const vscode = require('vscode');
const os = require('os');

var statusBarArray = [];
var statusBarSelect;
var outputChannel;
const RunTaskCommand = "actboy168.run-task"

function deactivate(context) {
    statusBarArray.forEach(i => {
        i.dispose();
    });
    statusBarArray = [];
    if (statusBarSelect) {
        statusBarSelect.dispose();
        statusBarSelect = undefined;
    }
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
    const pt = getPlatKV(t);
    if (typeof pt == 'object' && k in pt) {
        return pt[k];
    }
    if (k in t) {
        return t[k];
    }
    const gt = getPlatKV(g);
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
    const plat = getPlatKV(tbl);
    if (typeof plat == "object") {
        const res = getStatusBarValue(plat, key);
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
    const settings = vscode.workspace.getConfiguration("tasks.statusbar.default");
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
    const props = [];
    const script = getValue(task, config, "script");
    const path = getValue(task, config, "path");

    if (typeof name == "string") {
        props.push(name);
    }
    else if (typeof script == "string" && typeof path == "string") {
        props.push(script + " - " + path.substr(0, path.length - 1));
    }
    else if (typeof script == "string") {
        props.push(script);
    }
    else {
        props.push("");
    }
    let first = true;
    if (typeof path == "string") {
        if (first) {
            props.push("vscode.npm.path");
            first = false;
        }
        else {
            props.push("path");
        }
        props.push(path);
    }
    if (typeof script == "string") {
        if (first) {
            props.push("vscode.npm.script");
            first = false;
        }
        else {
            props.push("script");
        }
        props.push(script);
    }
    props.push("type");
    props.push("npm");
    return computeTaskExecutionId(props);
}

function computeId(task, config) {
    const name = "label" in task ? task.label : task.taskName;
    const type = getValue(task, config, "type");
    if (type == "npm") {
        return computeIdForNpm(task, config, name);
    }
    const props = [];
    const command = getValue(task, config, "command");
    const args = getValue(task, config, "args");
    if (typeof name == "string") {
        props.push(name);
    }
    if (command === undefined) {
        props.push("$empty");
    }
    else {
        if (typeof type == "string") {
            props.push(type);
        }
        if (typeof command == "string") {
            props.push(command);
        }
        else if (Array.isArray(command)) {
            let cmds;
            for (const c of command) {
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
            for (const arg of args) {
                if (typeof arg == "string") {
                    props.push(arg);
                } else if (typeof arg == "object") {
                    props.push(arg.value);
                }
            }
        }
    }
    return computeTaskExecutionId(props);
}

function getTaskId(task) {
    if (task.definition.type == "npm") {
        return task._id;
    }
    if (task.definition.type === "$empty") {
        return "$empty,";
    }
    return task.definition.id;
}

function convertColor(color) {
    if (typeof color == "string") {
        if (color.slice(0, 1) === "#") {
            return color;
        }
        else if (color === "") {
            return undefined;
        }
        else {
            return vscode.ThemeColor(color);
        }
    }
    return undefined;
}

function needShowStatusBar(statusBar, currentFilePath) {
    try {
        return !statusBar.filePattern || (currentFilePath && new RegExp(statusBar.filePattern).test(currentFilePath));
    } catch (error) {
        outputChannel.appendLine(`Error validating status bar item '${statusBar.text}' filePattern for active file '${currentFilePath}'. ${error.name}: ${error.message}`);
    }
    return false;
}

function updateStatusBar() {
    const settings = vscode.workspace.getConfiguration("tasks.statusbar");
    let count = 0;
    const currentFilePath = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.fileName;
    for (const statusBar of statusBarArray) {
        if (needShowStatusBar(statusBar, currentFilePath)) {
            if (settings.limit <= count) {
                statusBarSelect.show();
                return;
            }
            statusBar.show();
            count++;
        } else {
            statusBar.hide();
        }
    }
    statusBarSelect.hide();
}

function createTaskStatusBar(context, info) {
    const task = info.task;
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    statusBar.text = info.label || task.name;
    statusBar.tooltip = info.tooltip || task.detail;
    statusBar.color = convertColor(info.color);
    statusBar.filePattern = info.filePattern;
    statusBar.command = {
        command: RunTaskCommand,
        arguments: [task]
    };
    statusBarArray.push(statusBar);
    context.subscriptions.push(statusBar);
}

function createSelectStatusBar(context) {
    const settings = vscode.workspace.getConfiguration("tasks.statusbar.select");
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    statusBar.text = settings.label || "...";
    statusBar.color = convertColor(settings.color);
    statusBar.command = "workbench.action.tasks.runTask";
    statusBarSelect = statusBar;
    context.subscriptions.push(statusBar);
}

function matchTasks(taskInfo, taskMap, config) {
    if (typeof config != "object" || !Array.isArray(config.tasks)) {
        return;
    }
    for (const taskCfg of config.tasks) {
        const taskId = computeId(taskCfg, config);
        const task = taskMap[taskId];
        if (!task) {
            outputChannel.appendLine(`Not found task: ${taskId}`);
            continue;
        }
        delete taskMap[taskId];
        const hide = getStatusBar(taskCfg, config, "hide");
        if (hide) {
            continue;
        }
        taskInfo.push({
            task: task,
            label: getStatusBar(taskCfg, config, "label"),
            tooltip: getStatusBar(taskCfg, config, "tooltip"),
            color: getStatusBar(taskCfg, config, "color"),
            filePattern: getStatusBar(taskCfg, config, "filePattern"),
        });
    }
}

function loadTasks(context) {
    deactivate(context)
    if (vscode.workspace.workspaceFolders === undefined) {
        return;
    }

    vscode.tasks.fetchTasks().then((tasks) => {
        let taskInfo = [];
        let taskMap = {};
        for (const task of tasks) {
            if (task.source == "Workspace") {
                const taskId = task.name + ',' + getTaskId(task);
                taskMap[taskId] = task;
            }
        }
        const configuration = vscode.workspace.getConfiguration();
        if (configuration) {
            const tasksJson = configuration.inspect('tasks');
            if (tasksJson) {
                matchTasks(taskInfo, taskMap, tasksJson.globalValue);
            }
        }
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const configuration = vscode.workspace.getConfiguration(null, workspaceFolder.uri);
            if (configuration) {
                const tasksJson = configuration.inspect('tasks');
                if (tasksJson) {
                    matchTasks(taskInfo, taskMap, tasksJson.workspaceFolderValue);
                }
            }
        }
        for (const taskId in taskMap) {
            outputChannel.appendLine(`No match task: ${taskId}`);
        }
        for (const info of taskInfo) {
            createTaskStatusBar(context, info);
        }
        createSelectStatusBar(context);
        updateStatusBar();
    });
}

function runTask(task) {
    vscode.tasks.executeTask(task).catch((err) => {
        vscode.window.showWarningMessage(err.message).then(_ => undefined);
    });
}

function activate(context) {
    outputChannel = vscode.window.createOutputChannel("VSCode Tasks");
    context.subscriptions.push(vscode.commands.registerCommand(RunTaskCommand, (args) => {
        switch (typeof args) {
            case "number":
                const statusBar = statusBarArray[args - 1];
                if (statusBar) {
                    const task = statusBar.command.arguments[0];
                    runTask(task);
                }
                else {
                    outputChannel.appendLine(`Not found task #${args}`);
                }
                break;
            case "object":
                runTask(args);
                break;
            default:
                outputChannel.appendLine(`Invalid task: ${args}`);
                break;
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        loadTasks(context);
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        loadTasks(context);
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        updateStatusBar();
    }));
    loadTasks(context);
}

exports.activate = activate;
exports.deactivate = deactivate;
