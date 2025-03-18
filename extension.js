const vscode = require('vscode');
const os = require('os');

var statusBarArray = [];
var selectList = [];
var eventChangeActiveTextEditor;
var outputChannel;
const RunTaskCommand = "actboy168.run-task"
const SelectTaskCommand = "actboy168.select-task"

//const VSCodeVersion = (function() {
//    const res = vscode.version.split(".");
//    return parseInt(res[1]);
//})()

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
                    description: statusBar.tooltip ? statusBar.tooltip.value : undefined,
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
        statusBarArray[statusBarArray.length - 1].show();
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
    let o = typeof a === "object" ? a : {};
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
    if (t.type === undefined) {
        t.type = "process";
    }
    return t
}

const ObjectAttribute = {
    label: "name",
    detail: "detail",
};

const VSCodeAttribute = {
    label: true,
    icon: true,
    detail: true,
    hide: true,
};

const HasDefaultAttribute = {
    hide: true,
    color: true,
};

function isObject(obj) {
    var type = typeof obj;
    return type === 'object' && !!obj;
}

function getAttribute(taskObject, taskInfo, key, isRunning) {
    if (isObject(taskInfo.options) && isObject(taskInfo.options.statusbar)) {
        if (isRunning && isObject(taskInfo.options.statusbar.running)) {
            if (key in taskInfo.options.statusbar.running) {
                return taskInfo.options.statusbar.running[key];
            }
        }
        if (key in taskInfo.options.statusbar) {
            return taskInfo.options.statusbar[key];
        }
    }
    if (taskObject !== undefined && key in ObjectAttribute) {
        const objectKey = ObjectAttribute[key];
        if (objectKey in taskObject) {
            return taskObject[objectKey];
        }
    }
    if (key in VSCodeAttribute) {
        if (key in taskInfo) {
            return taskInfo[key];
        }
    }
    if (key in HasDefaultAttribute) {
        const settings = vscode.workspace.getConfiguration("tasks.statusbar.default");
        if (settings === undefined) {
            return;
        }
        return settings[key];
    }
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
        type: id !== undefined ? type : "$empty",
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
    const b_type = typeof b;
    if (a_type !== b_type) {
        return false;
    }
    if (a_type !== "object") {
        return a === b;
    }
    const a_keys = Object.keys(a);
    const b_keys = Object.keys(b);
    if (a_keys.length !== b_keys.length) {
        return false;
    }
    for (const key of a_keys) {
        if (!deepEqual(a[key], b[key])) {
            return false;
        }
    }
    return true;
}

function matchComposite(a, b) {
    if (a.definition.type == "npm") {
        // TODO: check detail
        if (b.label === undefined) {
            return a.name === b.script;
        }
        else {
            return a.name === b.label;
        }
    }
    if (a.detail !== b.detail) {
        return false;
    }
    return a.name === b.label;
}

function matchDefinition(a, b) {
    for (const k in a) {
        const v = a[k];
        if (!deepEqual(v, b[k])) {
            return false;
        }
    }
    return true;
}

function matchTask(tasks, taskInfo) {
    const taskDefinition = computeTaskDefinition(taskInfo);
    for (let i = 0; i < tasks.length; ++i) {
        const v = tasks[i];
        if (matchComposite(v, taskInfo)) {
            if (v.definition.type === "$empty"
                || v.definition.type === "$composite"
                || matchDefinition(v.definition, taskDefinition)
            ) {
                tasks.splice(i, 1);
                return v;
            }
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

function createSelectStatusBar() {
    const settings = vscode.workspace.getConfiguration("tasks.statusbar.select");
    return {
        text: settings.label || "...",
        tooltip: undefined,
        color: convertColor(settings.color),
        backgroundColor: undefined,
        filePattern: undefined,
        command: SelectTaskCommand
    };
}

function syncStatusBar(memoryStatusBarArray) {
    const diff = memoryStatusBarArray.length - statusBarArray.length;
    for (let i = 0; i < diff; ++i) {
        let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
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

function matchTasksInScope(memoryStatusBarArray, tasks, runningTasks, config) {
    if (typeof config != "object" || !Array.isArray(config.tasks)) {
        return;
    }
    for (const taskCfg of config.tasks) {
        const taskInfo = computeTaskInfo(taskCfg, config);
        const hide = getAttribute(undefined, taskInfo, "hide");
        if (hide) {
            continue;
        }
        const taskObject = matchTask(tasks, taskInfo);
        if (!taskObject) {
            let label = getAttribute(undefined, taskInfo, "label");
            if (label !== undefined) {
                LOG(`Not found task: ${label}`);
            }
            else {
                LOG(`Not found task: { type:${taskCfg.type} }`);
            }
            continue;
        }
        const isRunning = runningTasks[taskObject._id];
        let label = getAttribute(taskObject, taskInfo, "label", isRunning);
        const icon = getAttribute(taskObject, taskInfo, "icon", isRunning);
        if (icon && icon.id) {
            label = `$(${icon.id}) ${label}`;
        }
        const detail = getAttribute(taskObject, taskInfo, "detail");
        const color = getAttribute(taskObject, taskInfo, "color", isRunning);
        const backgroundColor = getAttribute(taskObject, taskInfo, "backgroundColor", isRunning);
        const filePattern = getAttribute(taskObject, taskInfo, "filePattern");
        memoryStatusBarArray.push({
            text: label,
            tooltip: convertTooltip(detail),
            color: convertColor(color),
            backgroundColor: backgroundColor ? new vscode.ThemeColor(backgroundColor) : undefined,
            filePattern: filePattern,
            command: {
                command: RunTaskCommand,
                arguments: [taskObject]
            }
        })
    }
}

function matchAllTasks(tasks) {
    let runningTasks = {};
    for (const e of vscode.tasks.taskExecutions) {
        runningTasks[e.task._id] = true;
    }
    // todo: use task.scope to filter
    let memoryStatusBarArray = [];
    const configuration = vscode.workspace.getConfiguration();
    if (configuration) {
        const tasksJson = configuration.inspect('tasks');
        if (tasksJson) {
            matchTasksInScope(memoryStatusBarArray, tasks, runningTasks, tasksJson.globalValue);
            matchTasksInScope(memoryStatusBarArray, tasks, runningTasks, tasksJson.workspaceValue);
        }
    }
    if (vscode.workspace.workspaceFile !== undefined) {
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const configuration = vscode.workspace.getConfiguration(null, workspaceFolder.uri);
            if (configuration) {
                const tasksJson = configuration.inspect('tasks');
                if (tasksJson) {
                    matchTasksInScope(memoryStatusBarArray, tasks, runningTasks, tasksJson.workspaceFolderValue);
                }
            }
        }
    }
    for (const task of tasks) {
        LOG(`No match task: ${task.name}`);
    }
    return memoryStatusBarArray;
}

function loadTasks() {
    if (vscode.workspace.workspaceFolders === undefined) {
        cleanStatusBar();
        closeUpdateStatusBar();
        return;
    }

    vscode.tasks.fetchTasks().then((tasks) => {
        tasks = tasks.filter(task => task.source === "Workspace");
        let memoryStatusBarArray = matchAllTasks(tasks);
        if (memoryStatusBarArray.length > 0) {
            memoryStatusBarArray.push(createSelectStatusBar());
            syncStatusBar(memoryStatusBarArray);
            openUpdateStatusBar();
        }
        else {
            cleanStatusBar();
            closeUpdateStatusBar();
        }
    });
}

const MinimumFetchInterval = 1000;
var fetchLastTime = 0;
var fetchTimer;

function loadTasksDelay(timeout) {
    if (fetchTimer !== undefined) {
        clearTimeout(fetchTimer);
    }
    fetchTimer = setTimeout(() => {
        fetchTimer = undefined;
        fetchLastTime = Date.now();
        loadTasks();
    }, timeout);
}

function loadTasksWait() {
    const now = Date.now();
    if (now < fetchLastTime + MinimumFetchInterval) {
        loadTasksDelay(MinimumFetchInterval);
    } else {
        if (fetchTimer === undefined) {
            fetchLastTime = now;
            loadTasks();
        }
    }
}

function refreshTask(task) {
    if (task.source !== "Workspace") {
        return;
    }
    let memoryStatusBarArray = matchAllTasks([task]);
    if (memoryStatusBarArray.length == 0) {
        return;
    }
    let found = statusBarArray.find((statusBar) => {
        if (!statusBar.command.arguments) {
            return false;
        }
        return statusBar.command.arguments[0]._id === task._id;
    });
    if (found) {
        const statusBar = memoryStatusBarArray[0];
        found.text = statusBar.text;
        found.tooltip = statusBar.tooltip;
        found.color = statusBar.color;
        found.backgroundColor = statusBar.backgroundColor;
    }
}

function runTask(task) {
    vscode.tasks.executeTask(task).catch((err) => {
        vscode.window.showWarningMessage(err.message).then(_ => undefined);
    });
}

function activate(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand(RunTaskCommand, (args) => {
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
        }),
        vscode.commands.registerCommand(SelectTaskCommand, () => {
            vscode.window.showQuickPick(selectList, { placeHolder: "Select task to execute" }).then(value => {
                if (value !== undefined) {
                    runTask(value.task);
                }
            })
        }),
        vscode.workspace.onDidChangeConfiguration(loadTasksWait),
        vscode.workspace.onDidChangeWorkspaceFolders(loadTasksWait),
        vscode.tasks.onDidStartTask((e) => {
            refreshTask(e.execution.task);
        }),
        vscode.tasks.onDidEndTask((e) => {
            refreshTask(e.execution.task);
        })
    );
    loadTasksDelay(0);
}

exports.activate = activate;
exports.deactivate = deactivate;
