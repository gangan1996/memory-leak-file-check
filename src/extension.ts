'use strict';

import * as vscode from 'vscode';
import { leakFileProvider } from './memoryLeakFiles';
import { getCodeLeakPos } from './tools';


export function activate(context: vscode.ExtensionContext) {

	// 新增工作区树结构
	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
	const memoryLeakFileCheckProvider = new leakFileProvider(rootPath);
	vscode.window.registerTreeDataProvider('memoryLeakFileCheck', memoryLeakFileCheckProvider);
	vscode.commands.registerCommand('memoryLeakFileCheck.refreshEntry', () => memoryLeakFileCheckProvider.refresh());
	vscode.commands.registerCommand('extension.openMemoryLeakFile', (moduleName, line, column) => {
		const start = new vscode.Position(line, column);
		vscode.commands.executeCommand('vscode.open', vscode.Uri.file(`${rootPath + moduleName}`), { selection: new vscode.Range(start, start) });
	});

	let timeout: NodeJS.Timer | undefined = undefined;

	// error 装饰
	const errorDecorationType = vscode.window.createTextEditorDecorationType({
		borderWidth: '1px',
		borderStyle: 'solid',
		overviewRulerColor: 'red',
		overviewRulerLane: vscode.OverviewRulerLane.Right,
		backgroundColor: { id: 'errorCode' }
	});

	// warning 装饰
	const warningDecorationType = vscode.window.createTextEditorDecorationType({
		cursor: 'crosshair',
		// use a themable color. See package.json for the declaration and default values.
		backgroundColor: { id: 'warningCode' }
	});

	let activeEditor = vscode.window.activeTextEditor;

	function updateDecorations() {
		if (!activeEditor) {
			return;
		}
		const text = activeEditor.document.getText();
		const errorDecs: any[] = [];
		const warningDecs: any[] = [];
		const leakPosList = getCodeLeakPos(text);
		leakPosList.forEach((pos: any) => {
			if (activeEditor) {
				const start = activeEditor.document.positionAt(pos.start);
				const end = activeEditor.document.positionAt(pos.end);
				if (pos.errorType === 'error') {
					const decoration = { range: new vscode.Range(start, end), hoverMessage: 'lead memory leak error' };
					errorDecs.push(decoration);
				} else if (pos.errorType === 'warning') {
					const decoration = { range: new vscode.Range(start, end), hoverMessage: 'lead memory leak warning' };
					warningDecs.push(decoration);
				}
			}
		});
		activeEditor.setDecorations(errorDecorationType, errorDecs);
		activeEditor.setDecorations(warningDecorationType, warningDecs);
	}

	function triggerUpdateDecorations(throttle = false) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if (throttle) {
			timeout = setTimeout(updateDecorations, 500);
		} else {
			updateDecorations();
		}
	}

	if (activeEditor) {
		triggerUpdateDecorations();
	}

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			triggerUpdateDecorations(true);
		}
	}, null, context.subscriptions);
}