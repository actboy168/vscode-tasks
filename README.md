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
