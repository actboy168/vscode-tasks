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

const platform = os.platform();

function getPlatformValue(t) {
    if (platform == "win32") {
        return t.windows
    }
    else if (platform == "darwin") {
        return t.osx
    }
    else {
        return t.linux
    }
}

function deepClone(a, b) {
    if (typeof b !== "object" || !b) {
        return b;
    }
    if (Array.isArray(b)) {
        return b.slice();
    }
    let o = typeof a === "object"? a: {};
    for (const k in b) {
        o[k] = deepClone(o[k], b[k]);
    }
    return o;
};

function copyObject(t, a) {
    for (const k in a) {
        t[k] = deepClone(t[k], a[k])
    }
}

function copyObjectWithIgnore(t, a, ignore) {
    for (const k in a) {
        if (!(k in ignore)) {
            t[k] = deepClone(t[k], a[k])
        }
    }
}

const ignore_globals = {
    tasks: true,
    version: true,
    windows: true,
    osx: true,
    linux: true,
};

const ignore_locals = {
    windows: true,
    osx: true,
    linux: true,
};

function computeTaskInfo(task, config) {
    let t = {}
    copyObjectWithIgnore(t, config, ignore_globals)
    copyObject(t, getPlatformValue(config))
    copyObjectWithIgnore(t, task, ignore_locals)
    copyObject(t, getPlatformValue(task))
    return t
}

function getStatusBarValue(task, key) {
    if (("options" in task) && (typeof task.options === 'object')
        && ("statusbar" in task.options) && (typeof task.options.statusbar === 'object')
        && (key in task.options.statusbar)) {
        return task.options.statusbar[key];
    }
    if (key in task) {
        return task[key];
    }
    const settings = vscode.workspace.getConfiguration("tasks.statusbar.default");
    if (settings !== undefined) {
        return settings[key];
    }
    return undefined;
}

function computeTaskExecutionId(taskInfo, type) {
    const props = [];
    const command = taskInfo.command;
    const args = taskInfo.args;
    props.push(type);
    if (typeof command === "string") {
        props.push(command);
    }
    else if (Array.isArray(command)) {
        let cmds;
        for (const c of command) {
            if (typeof c === "string") {
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
    else {
        return;
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
    let id = '';
    for (let i = 0; i < props.length; i++) {
        id += props[i].replace(/,/g, ',,') + ',';
    }
    return id;
}

function computeTaskExecutionDefinition(taskInfo, type) {
    const id = computeTaskExecutionId(taskInfo, type);
    if (id === undefined) {
        return {
            type: "$empty"
        };
    }
    return {
        type: id !== undefined? type: "$empty",
        id: id
    };
}

function computeTaskDefinition(taskInfo) {
    const type = taskInfo.type;
    if (type == "shell" || type == "process") {
        return computeTaskExecutionDefinition(taskInfo, type);
    }
    return taskInfo;
}

function deepEqual(a, b) {
    const a_type = typeof a;
    const b_type = typeof a;
    if (a_type !== b_type) {
        return false;
    }
    if (a_type !== "object") {
        return a !== b;
    }
    const a_keys = Object.keys(a);
    const b_keys = Object.keys(b);
    if (a_keys.length !== b_keys.length) {
        return false;
    }
    for (const key of a_keys) {
        if (!deepEqual(a[key], b[key])){
            return false;
        }
    }
    return true;
}

function matchDefinition(a, b) {
    if (a.type === "$empty" || a.type === "$composite") {
        //TODO
        return true;
    }
    for (const k in a) {
        const v = a[k];
        if (deepEqual(v, b[k])) {
            return false;
        }
    }
    return true;
}

function matchTask(taskMap, taskName, taskDefinition) {
    if (!(taskName in taskMap)) {
        return;
    }
    const ary = taskMap[taskName];
    if (ary.length == 1) {
        delete taskMap[taskName];
        return ary[0];
    }
    for (let i = 0; i < ary.length; ++i) {
        const v = ary[i];
        if (matchDefinition(v.definition, taskDefinition)) {
            ary.splice(i, 1);
            return v;
        }
    }
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
            return new vscode.ThemeColor(color);
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
        backgroundColor: info.backgroundColor? new vscode.ThemeColor(info.backgroundColor): undefined,
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

function matchTasks(taskStatusBars, taskMap, config) {
    if (typeof config != "object" || !Array.isArray(config.tasks)) {
        return;
    }
    for (const taskCfg of config.tasks) {
        const taskName = "label" in taskCfg ? taskCfg.label : taskCfg.taskName;
        const taskInfo = computeTaskInfo(taskCfg, config);
        const taskDefinition = computeTaskDefinition(taskInfo);
        const task = matchTask(taskMap, taskName, taskDefinition);
        if (!task) {
            LOG(`Not found task: ${taskName}`);
            continue;
        }
        const hide = getStatusBarValue(taskInfo, "hide");
        if (hide) {
            continue;
        }
        let label = getStatusBarValue(taskInfo, "label");
        if (!label) {
            if (VSCodeVersion >= 69) {
                const icon = taskInfo.icon;
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
        taskStatusBars.push({
            task: task,
            label: label,
            tooltip: getStatusBarValue(taskInfo, "tooltip"),
            color: getStatusBarValue(taskInfo, "color"),
            backgroundColor: getStatusBarValue(taskInfo, "backgroundColor"),
            filePattern: getStatusBarValue(taskInfo, "filePattern"),
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
        let taskStatusBars = [];
        let taskMap = {};
        for (const task of tasks) {
            if (task.source == "Workspace") {
                if (task.name in taskMap) {
                    taskMap[task.name].push(task);
                }
                else {
                    taskMap[task.name] = [task];
                }
            }
        }
        const configuration = vscode.workspace.getConfiguration();
        if (configuration) {
            const tasksJson = configuration.inspect('tasks');
            if (tasksJson) {
                matchTasks(taskStatusBars, taskMap, tasksJson.globalValue);
                matchTasks(taskStatusBars, taskMap, tasksJson.workspaceValue);
            }
        }
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const configuration = vscode.workspace.getConfiguration(null, workspaceFolder.uri);
            if (configuration) {
                const tasksJson = configuration.inspect('tasks');
                if (tasksJson) {
                    matchTasks(taskStatusBars, taskMap, tasksJson.workspaceFolderValue);
                }
            }
        }
        for (const taskName in taskMap) {
            LOG(`No match task: ${taskName}`);
        }
        if (taskStatusBars.length > 0) {
            for (const info of taskStatusBars) {
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
