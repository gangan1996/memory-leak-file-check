import * as vscode from 'vscode';
import * as path from 'path';
import { getCheckerConfig, getFileList, getMemoryLeakInfo } from './tools';

export class leakFileProvider implements vscode.TreeDataProvider<Dependency> {

	private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | void> = new vscode.EventEmitter<Dependency | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: string | undefined) {
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Dependency): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Dependency): Thenable<Dependency[]> {
		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage('No dependency in empty workspace');
			return Promise.resolve([]);
		}
		const deps: Dependency[] = [];
		let icon = 'document';
		if (element) {
			if (element.isFile) {
				element.leakList.forEach((item) => {
					icon = item.errorType === 'error' ? 'error' : 'warning';
					deps.push(new Dependency(item.content, '', false, [], vscode.TreeItemCollapsibleState.None, {
						command: 'extension.openMemoryLeakFile',
						title: '',
						arguments: [element.label, item.loc.start.line + item.scriptLine - 2, item.loc.start.column]
					}, icon));
				});
			}
		} else {
			const checkerConfig = getCheckerConfig(this.workspaceRoot);
			const list = getFileList(this.workspaceRoot + checkerConfig.codeDir, checkerConfig);
			const leakFileList = getMemoryLeakInfo(list);

			leakFileList.forEach((item) => {
				const fileString = this.workspaceRoot ? item.file.replace(this.workspaceRoot, '') : '';
				deps.push(new Dependency(fileString, item.leakList.length + '个泄漏', true, item.leakList, vscode.TreeItemCollapsibleState.Collapsed, {
					command: 'extension.openMemoryLeakFile',
					title: '',
					arguments: [item.file, 0, 0]
				}, icon));
			});

		}
		return Promise.resolve(deps);

	}
}

export class Dependency extends vscode.TreeItem {

	constructor(
		public readonly label: string,
		private readonly desc: string,
		public readonly isFile: boolean,
		public readonly leakList: any[],
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command,
		private readonly icon?: string
	) {
		super(label, collapsibleState);

		this.tooltip = `${this.label}-${this.desc}`;
		this.description = this.desc;
	}

	iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'light', this.icon + '.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', this.icon + '.svg')
	};

	contextValue = 'dependency';
}
