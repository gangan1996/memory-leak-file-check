/* eslint-disable */
import * as parser from '@babel/parser';
const traverse = require("@babel/traverse").default;
const compilerSFC = require("@vue/compiler-sfc")
const fs = require('fs');
const path = require('path');
const _isDir = (path: string) => {
	try {
		const state = fs.statSync(path);
		return !state.isFile();
	} catch(err) {
		console.log(err)
		return false
	}

}

interface CheckerConfig {
	codeDir: string
	excludedDirNameSet: Set<string>,
	includedFileSuffixSet: Set<string>,
	excludedFileNameSet: Set<string>
}
interface LeakObj {
	errorType: string,
	start: number,
	end: number,
	content: string,
	loc: object,
	scriptLine: number
}
interface leakFile {
	isFile: boolean,
	file: string,
	leakList: LeakObj[]
}
export function getCheckerConfig(rootPath: string | undefined) {
	const vscodeConfigPath = path.join(rootPath, '/.vscode/memory_leak_checker_config.json');
	const projectConfigPath = path.join(rootPath, '/.project/memory_leak_checker_config.json');
	const basicConfig = {
		codeDir: '', // '/src/renderer',
		excludedDirNameSet: new Set(["node_modules", ".git"]),
		includedFileSuffixSet: new Set([".vue"]),
		excludedFileNameSet: new Set([".DS_Store"])
	}
	let configPath;
	// support config file in .vscode or .project
	if (fs.existsSync(vscodeConfigPath)) {
		configPath = vscodeConfigPath;
	} else if (fs.existsSync(projectConfigPath)) {
		configPath = projectConfigPath;
	} else {
		return basicConfig;
	}
	try {
		// avoid parse error
		const config = JSON.parse(fs.readFileSync(configPath, {
			encoding: 'utf-8'
		}));
		// because of word cannot include spec chars
		// so whiteList support word connected by ‘,’ or word array
		basicConfig.excludedDirNameSet = config.excludedFloders ? new Set(config.excludedFloders) : basicConfig.excludedDirNameSet;
		basicConfig.includedFileSuffixSet = config.includedFileSubfixes ? new Set(config.includedFileSubfixes) : basicConfig.includedFileSuffixSet;
		basicConfig.excludedFileNameSet = config.excludedFileNames ? new Set(config.excludedFileNames) : basicConfig.excludedFileNameSet;
		basicConfig.codeDir = config.codeDir ? config.codeDir : basicConfig.codeDir;
		return basicConfig;
	} catch (err) {
		return basicConfig;
	}
}
export function getFileList(rootPath: string | undefined, checkerConfig: CheckerConfig): string[] {
	const fileList: string[] = [];
	let dirSubItems = []
	try {
		dirSubItems = fs.readdirSync(rootPath);
	} catch (err) {
		console.log('err', err)
	}
	for (const item of dirSubItems) {
		const childPath = path.join(rootPath, item);
		if (_isDir(childPath) && !checkerConfig.excludedDirNameSet.has(item)) {
			fileList.push(...getFileList(childPath, checkerConfig));
		} else if (!_isDir(childPath) && (checkerConfig.includedFileSuffixSet.size == 0 || checkerConfig.includedFileSuffixSet.has(path.extname(item))) && !checkerConfig.excludedFileNameSet.has(item)) {
			fileList.push(childPath);
		}
	}
	return fileList;

}

const eventRegisterKeyMap: any = {
	$on: {
		isOn: true,
		cp: ["$off"],
	},
	$off: {
		isOn: false,
		cp: ["$on"],
	},
	on: {
		isOn: true,
		cp: ["off", "removeListener"],
	},
	removeListener: {
		isOn: false,
		cp: ["on"]
	},
	off: {
		isOn: false,
		cp: ["on"],
	},
	addEventListener: {
		isOn: true,
		cp: ["removeEventListener"],
	},
	removeEventListener: {
		isOn: false,
		cp: ["addEventListener"],
	},
	onPush: {
		isOn: true,
		cp: ["removePushListener"],
		reverse: true,
		noKey: true
	},
	removePushListener: {
		isOn: false,
		cp: ["onPush"],
		reverse: true,
		noKey: true
	},
};
let globalObjList: string[] = []
let thisValueList: any[] = []

function isSameObj(obj1: any, obj2: any): Boolean {
	if (obj1 && obj2 && obj1.type === obj2.type) {
		if (obj1.type === "ThisExpression") {
			return true;
		} else if (obj1.type === "Identifier" && obj1.name === obj2.name) {
			return true;
		} else if (
			obj1.type === "MemberExpression" &&
			obj1.property.name === obj2.property.name
		) {
			return isSameObj(obj1.object, obj2.object);
		}
	}
	return false;
}

function getRealObj(obj: any): string {
	if (obj.type === 'Identifier') {
		return obj.name
	} else if (obj.type === 'MemberExpression') {
		return getRealObj(obj.object)
	} else {
		return obj.type
	}
}

function hasThis(args: any[]): boolean {
	if (args.length) {
		for (let i = 0; i < args.length; i++) {
			const arg = args[i]
			for (let j = 0; j < thisValueList.length; j++) {
				if (arg.start - 1 < thisValueList[j].start && arg.end + 1 > thisValueList[j].end) {
					return true
				}
			}
		}
	}
	return false
}


export function getCodeLeakPos(code: string): LeakObj[] {
	const posList: any[] = []
	const onEventList: any[] = [];
	const offEventList: any[] = [];
	const onGlobalValueList: any[] = [];
	const deleteGlobalValueList: any[] = [];
	const warningLeakList: any[] = []
	const sourceAst = compilerSFC.parse(code).descriptor // vueCompiler.parseComponent(code)
	const jsSource = sourceAst.script && sourceAst.script.content
	const scriptLine = sourceAst.script ? sourceAst.script.loc.start.line : 0
	const scriptStart = sourceAst.script ? sourceAst.script.loc.start.offset : 0
	globalObjList = ['window', 'document']
	thisValueList = []
	if (jsSource) {
		const ast = parser.parse(jsSource, {
			allowImportExportEverywhere: true,
			attachComment: true,
			plugins: ["typescript", "decorators-legacy"],
		});
		traverse(ast, {
			ImportDeclaration(path: any) {
				const specifiers = path.node.specifiers
				if (specifiers) {
					specifiers.forEach((specifier: any) => {
						globalObjList.push(specifier.local.name)
					})
				}
			}
		})
		traverse(ast, {
			ThisExpression(path: any) {
				thisValueList.push({
					start: path.node.start,
					end: path.node.end,
				})
			}
		})
		traverse(ast, {
			CallExpression(path: any) {
				const callee = path.node.callee;
				const args = path.node.arguments;
				if (callee.property && eventRegisterKeyMap[callee.property.name] && args.length) {
					const eventObj: any = {
						target: callee.object,
						register: callee.property.name,
						start: path.node.start,
						end: path.node.end,
						loc: path.node.loc
					};
					if (eventRegisterKeyMap[callee.property.name].reverse) {
						eventObj.cb = args[0];
						args.length > 1 && (eventObj.event = args[1].value);
					} else {
						eventObj.event = args[0].value;
						args.length > 1 && (eventObj.cb = args[1]);
					}
					if (eventRegisterKeyMap[callee.property.name].isOn) {
						onEventList.push(eventObj);
					} else {
						offEventList.push(eventObj);
					}
				}
				const obj = getRealObj(path.node.callee)
				const property = path.node.callee.property && path.node.callee.property.name
				if (globalObjList.indexOf(obj) > -1 && (!property || Object.keys(eventRegisterKeyMap).indexOf(property) === -1)) {
					const args = path.node.arguments
					if (hasThis(args)) {
						warningLeakList.push({
							start: path.node.start,
							end: path.node.end,
							loc: path.node.loc
						})
					}
				}
			},
			AssignmentExpression(path: any) {
				const operator = path.node.operator
				if (operator === '=') {
					const left = path.node.left
					const right = path.node.right
					const obj = getRealObj(left)
					if (globalObjList.indexOf(obj) > -1) {
						const globalValueObj = {
							target: left,
							start: path.node.start,
							end: path.node.end,
							loc: path.node.loc
						}
						if (right.type === 'NullLiteral' || (right.type === 'Identifier' && right.name === 'undefined')) {
							deleteGlobalValueList.push(globalValueObj)
						} else {
							onGlobalValueList.push(globalValueObj)
						}
					}
				}
			},
			UnaryExpression(path: any) {
				if (path.node.operator === 'delete') {
					const globalValueObj = {
						target: path.node.argument,
						start: path.node.start,
						end: path.node.end,
						loc: path.node.loc
					}
					deleteGlobalValueList.push(globalValueObj)
				}
			}
		});
		const leakEventList: any[] = [];
		onEventList.forEach((onEventObj) => {
			var hasOff = false;
			offEventList.forEach((offEventObj) => {
				if (
					isSameObj(onEventObj.target, offEventObj.target) &&
					(eventRegisterKeyMap[onEventObj.register].noKey || onEventObj.event === offEventObj.event) &&
					eventRegisterKeyMap[onEventObj.register].cp.indexOf(offEventObj.register) > -1 &&
					isSameObj(onEventObj.cb, offEventObj.cb)
				) {
					hasOff = true;
				}
			});
			if (!hasOff) {
				leakEventList.push(onEventObj);
			}
		});
		const leakGlobalValueList: any[] = [];
		onGlobalValueList.forEach((onGlobalValueObj) => {
			var hasDelete = false;
			deleteGlobalValueList.forEach((deleteGlobalValueObj) => {
				if (isSameObj(onGlobalValueObj.target, deleteGlobalValueObj.target)) {
					hasDelete = true
				}
			})
			if (!hasDelete) {
				leakGlobalValueList.push(onGlobalValueObj)
			}
		})
		leakEventList.forEach((event) => {
			posList.push({
				errorType: 'error',
				start: event.start + scriptStart,
				end: event.end + scriptStart,
				content: jsSource.substr(event.start, event.end - event.start),
				loc: event.loc,
				scriptLine: scriptLine
			})
		});
		leakGlobalValueList.forEach((event) => {
			posList.push({
				errorType: 'error',
				start: event.start + scriptStart,
				end: event.end + scriptStart,
				content: jsSource.substr(event.start, event.end - event.start),
				loc: event.loc,
				scriptLine: scriptLine
			})
		});
		warningLeakList.forEach((event) => {
			posList.push({
				errorType: 'warning',
				start: event.start + scriptStart,
				end: event.end + scriptStart,
				content: jsSource.substr(event.start, event.end - event.start),
				loc: event.loc,
				scriptLine: scriptLine
			})
		});
	}
	return posList
}

export function getMemoryLeakInfo(fileList: any[]): leakFile[] {
	const leakFileList = []
	for (const file of fileList) {
		try {
			const content = fs.readFileSync(file, {
				encoding: 'utf-8'
			});
			const leakPosList = getCodeLeakPos(content)
			if (leakPosList.length > 0) {
				leakFileList.push({
					isFile: true,
					file: file,
					leakList: leakPosList
				})
			}
		} catch (err) {

		}
	}
	return leakFileList
}