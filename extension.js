const vscode = require('vscode');
const os = require('os');
const crypto = require('crypto')

var statusBarArray = [];
var memoryStatusBarArray = [];
var selectList = [];
var eventChangeActiveTextEditor;
var outputChannel;
const RunTaskCommand = "actboy168.run-task"
const SelectTaskCommand = "actboy168.select-task"

var indicatorDisposeArray = [];
var statusBarMap = {};
const BAR_TEXT_RUNNING = "$(sync~spin) ";
const TASK_STATUS = {START: 1, END: 9};

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

function getAttribute(task, key) {
    if (("options" in task) && (typeof task.options === 'object')) {
        if (("statusbar" in task.options) && (typeof task.options.statusbar === 'object')) {
            if (key in task.options.statusbar) {
                return task.options.statusbar[key];
            }
        }
    }
    if (key in VSCodeAttribute) {
        if (key in task) {
            return task[key];
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
        if (!deepEqual(a[key], b[key])) {
            return false;
        }
    }
    return true;
}

function hashObj(obj) {
    let data = JSON.stringify(obj);
    let hash = crypto.createHash("md5");
    hash.update(data);
    return hash.digest("hex");
}

function matchComposite(a, b) {
    if (a.detail !== b.detail) {
        return false;
    }
    if (a.name !== b.label) {
        return false;
    }
    return true;
}

function matchDefinition(a, b) {
    for (const k in a) {
        const v = a[k];
        if (deepEqual(v, b[k])) {
            return false;
        }
    }
    return true;
}

function matchTask(tasks, taskInfo) {
    const taskDefinition = computeTaskDefinition(taskInfo);
    for (let i = 0; i < tasks.length; ++i) {
        const v = tasks[i];
        if (v.definition.type === "$empty" || v.definition.type === "$composite") {
            if (matchComposite(v, taskInfo)) {
                tasks.splice(i, 1);
                return v;
            }
        }
        else if (matchDefinition(v.definition, taskDefinition)) {
            tasks.splice(i, 1);
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
        tooltip: convertTooltip(info.detail),
        color: convertColor(info.color),
        backgroundColor: info.backgroundColor ? new vscode.ThemeColor(info.backgroundColor) : undefined,
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

        // save task-statusBar bindings
        if (from.command && from.command.arguments) {
            let tasks = from.command.arguments;
            // TODO: when from.command.arguments has more then one task
            let task =  tasks.length > 0 ? tasks[0] : null;
            if (task) {
                statusBarMap[hashObj(task)] = {bar: to, text: to.text};
            }
        }
    }
}

function matchTasksInScope(taskStatusBars, tasks, config) {
    if (typeof config != "object" || !Array.isArray(config.tasks)) {
        return;
    }
    for (const taskCfg of config.tasks) {
        const taskInfo = computeTaskInfo(taskCfg, config);
        const hide = getAttribute(taskInfo, "hide");
        if (hide) {
            continue;
        }
        let label = getAttribute(taskInfo, "label");
        const task = matchTask(tasks, taskInfo);
        if (!task) {
            if (label !== undefined) {
                LOG(`Not found task: ${label}`);
            }
            else {
                LOG(`Not found task: { type:${taskCfg.type} }`);
            }
            continue;
        }
        label = label || task.name;
        const icon = getAttribute(taskInfo, "icon");
        if (icon && icon.id) {
            label = `$(${icon.id}) ${label}`;
        }
        taskStatusBars.push({
            task: task,
            label: label,
            detail: getAttribute(taskInfo, "detail") || getAttribute(taskInfo, "tooltip"), // TODO: deprecated tooltip
            color: getAttribute(taskInfo, "color"),
            backgroundColor: getAttribute(taskInfo, "backgroundColor"),
            filePattern: getAttribute(taskInfo, "filePattern"),
        });
    }
}

function matchAllTasks(tasks) {
    // todo: use task.scope to filter
    let taskStatusBars = [];
    const configuration = vscode.workspace.getConfiguration();
    if (configuration) {
        const tasksJson = configuration.inspect('tasks');
        if (tasksJson) {
            matchTasksInScope(taskStatusBars, tasks, tasksJson.globalValue);
            matchTasksInScope(taskStatusBars, tasks, tasksJson.workspaceValue);
        }
    }
    if (vscode.workspace.workspaceFile !== undefined) {
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const configuration = vscode.workspace.getConfiguration(null, workspaceFolder.uri);
            if (configuration) {
                const tasksJson = configuration.inspect('tasks');
                if (tasksJson) {
                    matchTasksInScope(taskStatusBars, tasks, tasksJson.workspaceFolderValue);
                }
            }
        }
    }
    for (const task of tasks) {
        LOG(`No match task: ${task.name}`);
    }
    return taskStatusBars;
}

function loadTasks() {
    if (vscode.workspace.workspaceFolders === undefined) {
        memoryStatusBarArray = [];
        syncStatusBar();
        closeUpdateStatusBar();
        return;
    }

    vscode.tasks.fetchTasks().then((tasks) => {
        tasks.filter(task => task.source !== "Workspace");
        let taskStatusBars = matchAllTasks(tasks);
        if (taskStatusBars.length > 0) {
            memoryStatusBarArray = [];
            statusBarMap = {};
            for (const info of taskStatusBars) {
                createTaskStatusBar(info);
            }
            createSelectStatusBar();
            syncStatusBar();
            openUpdateStatusBar();
        }
        else {
            memoryStatusBarArray = [];
            syncStatusBar();
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

function runTask(task) {
    vscode.tasks.executeTask(task).catch((err) => {
        vscode.window.showWarningMessage(err.message).then(_ => undefined);
    });
}

/**
 * change the statusBar representation on task execution event
 * @param {*} barConfig 
 * @param {*} status 
 */
function updateBarStatus(barConfig, status) {
    if (barConfig && barConfig.bar && barConfig.text) {
        barConfig.bar.text = status === TASK_STATUS.START ? BAR_TEXT_RUNNING + barConfig.text : barConfig.text
    }
}

/**
 * get statusBar binding for task(by hash value of task definition)
 * @param {*} task 
 * @returns 
 */
function getStatusBarByTask(task) {
    return statusBarMap[hashObj(task)]
}

function syncIndicatorWithConfiguration(context) {
    let config = vscode.workspace.getConfiguration("tasks.statusbar.default");
    if (config["indicator"]) {
        indicatorDisposeArray.forEach(d => {
            d.dispose();
        });
        indicatorDisposeArray = [];
        let taskStartListener = vscode.tasks.onDidStartTask((e) => {
            updateBarStatus(getStatusBarByTask(e.execution.a), TASK_STATUS.START);
        });
        let taskEndListener = vscode.tasks.onDidEndTask((e) => {
            updateBarStatus(getStatusBarByTask(e.execution.a), TASK_STATUS.END);
        })
        indicatorDisposeArray.push(taskStartListener, taskEndListener);
        context.subscriptions.push(taskStartListener, taskEndListener);
    } else {
        indicatorDisposeArray.forEach(d => {
            d.dispose();
        });
        indicatorDisposeArray = [];
    }
}

function activate(context) {
    syncIndicatorWithConfiguration(context);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            syncIndicatorWithConfiguration(context);
        }),

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
        vscode.workspace.onDidChangeWorkspaceFolders(loadTasksWait)
    );
    loadTasksDelay(0);
}

exports.activate = activate;
exports.deactivate = deactivate;
