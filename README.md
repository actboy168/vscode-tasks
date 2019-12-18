# tasks
This extension loads VSCode tasks into status bar.

## Options
You can hide some tasks with the following options directly in tasks.json:

```json
"label": "Test",
"options": {
  "statusbar": {
    "hide" : true
  }
}
```

You can change the name of the task displayed on the status bar with the following options directly in tasks.json:

```json
"label": "Test",
"options": {
  "statusbar": {
    "label" : "ts"
  }
}
```

You can enable statusbar items based on the file in the active editor using the `filePattern` attribute, causing the statusbar item to be hidden when the active file does not match the specified pattern. If the `filePattern` attribute is not provided, the statusbar item will not be hidden based on the active file. (Note that `filePattern` only applies to statusbar items that have not been otherwise effectively set as hidden through `tasks.json` or `settings.json`).

For instance, the following would only display the "Test" button when a filename beginning with `test_` is the active editor:

```json
"label": "Test",
"options": {
  "statusbar": {
    "filePattern" : "test_.*"
  }
}
```
