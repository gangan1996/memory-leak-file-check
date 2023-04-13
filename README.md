# Views & View Containers

Detect code with memory leak risk in the project. This includes:

- Provide a tree view to display the file information and code information of the project memory leak
- Identify leaked code in documentation


## Config File
Provide config file at '/.vscode/memory_leak_checker_config.json' to accelerated code scanning.
The default configuration is
```
{
	codeDir: "",  // The code directory that needs to be scanned, used to narrow the scope of the scan
	excludedDirNameSet: ["node_modules", ".git"], // Excluded directories
	includedFileSuffixSet: [".vue", ".js"], // The extension of the file to be scanned
	excludedFileNameSet: [".DS_Store"], // Excluded filenames
	hideWarning: false, // Whether to hide warning alarms
	eventRegisterKeyMap: {}, // Configuration to detect event mounts and unmounts
	notUseDefaultEventRegisterKeyMap: false, // Do not use the default configuration provided by eventRegisterKeyMap
}
```
The leak error on the next line can be ignored by commenting
```
// memory-leak-check-ignore-next-line
```
eventRegisterKeyMap default configuration
```
	{
        "$on": {
            "isOn": true,
            "cp": [
                "$off"
            ]
        },
        "$off": {
            "isOn": false,
            "cp": [
                "$on"
            ]
        },
        "on": {
            "isOn": true,
            "cp": [
                "off",
                "removeListener"
            ]
        },
        "removeListener": {
            "isOn": false,
            "cp": [
                "on"
            ]
        },
        "off": {
            "isOn": false,
            "cp": [
                "on"
            ]
        },
        "addEventListener": {
            "isOn": true,
            "cp": [
                "removeEventListener"
            ]
        },
        "removeEventListener": {
            "isOn": false,
            "cp": [
                "addEventListener"
            ]
        },
        "onPush": {
            "isOn": true,
            "cp": [
                "removePushListener"
            ],
            "reverse": true,
            "noKey": true,
            "targetList": ["this.ipc"
            ]
        },
        "removePushListener": {
            "isOn": false,
            "cp": [
                "onPush"
            ],
            "reverse": true,
            "noKey": true,
            "targetList": ["this.ipc"
            ]
        },
        "ipcRendererOn": {
            "isOn": true,
            "cp": [
                "ipcRendererRemoveListener"
            ]
        },
        "ipcRendererRemoveListener": {
            "isOn": false,
            "cp": [
                "ipcRendererOn"
            ]
        }
    }
```

