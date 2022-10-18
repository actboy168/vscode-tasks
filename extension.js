const vscode = require('vscode');
const os = require('os');

var statusBarArray = [];
var memoryStatusBarArray = [];
var selectList = [];
var eventChangeActiveTextEditor;
var outputChannel;
const RunTaskCommand = "actboy168.run-task"
const SelectTaskCommand = "actboy168.select-task"

const VSCodeVersion = (function() {
    const res = vscode.version.split(".");
    return parseInt(res[1]);
})()

function LOG(msg) {
    if (outputChannel === undefined) {
        outputChannel = vscode.window.createOutputChannel("Extension-Tasks");
    }
    outputChannel.appendLine(msg);
}

function needShowStatusBar(statusBar, currentFilePath) {
    try {
        return !statusBar.filePattern || (currentFilePath && new RegExp(statusBar.filePattern).test(currentFilePath));
    } catch (error) {
        LOG(`Error validating status bar item '${statusBar.text}' filePattern for active file '${currentFilePath}'. ${error.name}: ${error.message}`);
    }
    return false;
}

function updateStatusBar() {
    for (const statusBar of statusBarArray) {
        statusBar.hide();
    }
    selectList = [];

    const settings = vscode.workspace.getConfiguration("tasks.statusbar");
    let count = 0;
    const currentFilePath = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.fileName;
    for (let i = 0; i < statusBarArray.length - 1; ++i) {
        const statusBar = statusBarArray[i];
        if (needShowStatusBar(statusBar, currentFilePath)) {
            if (typeof settings.limit === "number" && settings.limit <= count) {
                selectList.push({
                    label: statusBar.text,
                    description: statusBar.tooltip? statusBar.tooltip.value: undefined,
                    task: statusBar.command.arguments[0]
                });
            }
            else {
                statusBar.show();
                count++;
            }
        }
    }

    if (selectList.length > 0) {
        statusBarArray[statusBarArray.length-1].show();
    }
}

function openUpdateStatusBar() {
    if (eventChangeActiveTextEditor === undefined) {
        eventChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(updateStatusBar);
    }
    updateStatusBar();
}

function closeUpdateStatusBar() {
    if (eventChangeActiveTextEditor !== undefined) {
        eventChangeActiveTextEditor.dispose();
        eventChangeActiveTextEditor = undefined;
    }
}

function cleanStatusBar() {
    statusBarArray.forEach(i => {
        i.hide();
        i.dispose();
    });
    statusBarArray = [];
}

function deactivate() {
    closeUpdateStatusBar();
    cleanStatusBar();
    if (outputChannel !== undefined) {
        outputChannel.dispose();
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
        } else {
            props.push("process");
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
    if (task.definition.type === "$composite") {
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

function convertTooltip(tooltip) {
    if (tooltip) {
        let md = new vscode.MarkdownString(tooltip);
        md.isTrusted = true;
        md.supportThemeIcons = true;
        return md;
    }
}

function createTaskStatusBar(info) {
    const task = info.task;
    memoryStatusBarArray.push({
        text: info.label,
        tooltip: convertTooltip(info.tooltip || task.detail),
        color: convertColor(info.color),
        backgroundColor: info.backgroundColor? vscode.ThemeColor(info.backgroundColor): undefined,
        filePattern: info.filePattern,
        command: {
            command: RunTaskCommand,
            arguments: [task]
        }
    });
}

function createSelectStatusBar() {
    const settings = vscode.workspace.getConfiguration("tasks.statusbar.select");
    memoryStatusBarArray.push({
        text: settings.label || "...",
        tooltip: undefined,
        color: convertColor(settings.color),
        backgroundColor: undefined,
        filePattern: undefined,
        command: SelectTaskCommand
    });
}

function syncStatusBar() {
    const diff = memoryStatusBarArray.length - statusBarArray.length;
    for (let i = 0; i < diff; ++i) {
        let statusBar = vscode.window.createStatusBarItem("actboy168.tasks", vscode.StatusBarAlignment.Left, 50);
        statusBar.name = "Tasks";
        statusBarArray.push(statusBar);
    }
    for (let i = 0; i < -diff; ++i) {
        let statusBar = statusBarArray.pop();
        statusBar.hide();
        statusBar.dispose();
    }
    for (let i = 0; i < memoryStatusBarArray.length; ++i) {
        let to = statusBarArray[i];
        const from = memoryStatusBarArray[i];
        to.text = from.text;
        to.tooltip = from.tooltip;
        to.color = from.color;
        to.backgroundColor = from.backgroundColor;
        to.filePattern = from.filePattern;
        to.command = from.command;
    }
}

function matchTasks(taskInfo, taskMap, config) {
    if (typeof config != "object" || !Array.isArray(config.tasks)) {
        return;
    }
    for (const taskCfg of config.tasks) {
        const taskId = computeId(taskCfg, config);
        const task = taskMap[taskId];
        if (!task) {
            LOG(`Not found task: ${taskId}`);
            continue;
        }
        delete taskMap[taskId];
        const hide = getStatusBar(taskCfg, config, "hide");
        if (hide) {
            continue;
        }
        let label = getStatusBar(taskCfg, config, "label");
        if (!label) {
            if (VSCodeVersion >= 69) {
                const icon = getValue(taskCfg, config, "icon");
                if (icon && icon.id) {
                    label = `$(${icon.id}) ${task.name}`;
                }
                else {
                    label = task.name;
                }
            }
            else {
                label = task.name;
            }
        }
        taskInfo.push({
            task: task,
            label: label,
            tooltip: getStatusBar(taskCfg, config, "tooltip"),
            color: getStatusBar(taskCfg, config, "color"),
            backgroundColor: getStatusBar(taskCfg, config, "backgroundColor"),
            filePattern: getStatusBar(taskCfg, config, "filePattern"),
        });
    }
}

function loadTasks() {
    memoryStatusBarArray = [];
    if (vscode.workspace.workspaceFolders === undefined) {
        syncStatusBar();
        closeUpdateStatusBar();
        return;
    }

    vscode.tasks.fetchTasks().then((tasks) => {
        memoryStatusBarArray = [];
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
                matchTasks(taskInfo, taskMap, tasksJson.workspaceValue);
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
            LOG(`No match task: ${taskId}`);
        }
        if (taskInfo.length > 0) {
            for (const info of taskInfo) {
                createTaskStatusBar(info);
            }
            createSelectStatusBar();
            syncStatusBar();
            openUpdateStatusBar();
        }
        else {
            syncStatusBar();
            closeUpdateStatusBar();
        }
    });
}

function runTask(task) {
    vscode.tasks.executeTask(task).catch((err) => {
        vscode.window.showWarningMessage(err.message).then(_ => undefined);
    });
}

function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand(RunTaskCommand, (args) => {
        switch (typeof args) {
            case "number":
                const statusBar = statusBarArray[args - 1];
                if (statusBar) {
                    const task = statusBar.command.arguments[0];
                    runTask(task);
                }
                else {
                    LOG(`Not found task #${args}`);
                }
                break;
            case "object":
                runTask(args);
                break;
            default:
                LOG(`Invalid task: ${args}`);
                break;
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand(SelectTaskCommand, () => {
        vscode.window.showQuickPick(selectList, { placeHolder: "Select task to execute" }).then(value => {
            if (value !== undefined) {
                runTask(value.task);
            }
        })
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(loadTasks));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(loadTasks));
    loadTasks();
}

exports.activate = activate;
exports.deactivate = deactivate;
