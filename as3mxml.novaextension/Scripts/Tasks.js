class ActionScriptTasksAssistant {
	resolveTaskAction(context) {
		let action = context.action;
		let data = context.data;
		let config = context.config;

		console.log("CONTEXT::: " + JSON.stringify(context));

		if(action==Task.Build && data.type=="actionscript") {
			console.log("TASK -- BUILD goes here...");
		} else if(action==Task.Run && data.type=="actionscript") {
			console.log("TASK -- RUN goes here...");
		} else if(action==Task.Clean && data.type=="actionscript") {
			console.log("TASK -- CLEAN goes here...");
		}
		return null;

/*
		if (action == Task.Run && data.type == "chromeDebug") {
			// Chrome Debug
			let action = new TaskDebugAdapterAction("chrome");

			action.command = nova.path.normalize(nova.path.join(nova.extension.path, "../../NovaChromeDebugAdapter"))

			// Debug Args
			let request = config.get("request", "string");
			if (!request) {
				request = "launch";
			}
			action.debugRequest = request;

			let debugArgs = {};

			let sourceURL = config.get("sourceURL", "string");
			if (!sourceURL) {
				sourceURL = nova.workspace.previewURL;
			}
			debugArgs.sourceURL = sourceURL;

			let sourceRoot = config.get("sourceRoot", "string");
			if (sourceRoot) {
				if (!nova.path.isAbsolute(sourceRoot)) {
					sourceRoot = nova.path.join(nova.workspace.path, sourceRoot);
				}
			}
			else {
				sourceRoot = nova.workspace.previewRootPath;
			}
			debugArgs.sourceRoot = sourceRoot;

			let launchPath = config.get("launchPath", "string");
			if (launchPath && !nova.path.isAbsolute(launchPath)) {
				launchPath = nova.path.join(nova.workspace.path, launchPath);
			}
			debugArgs.launchPath = launchPath;

			debugArgs.launchArgs = config.get("launchArgs", "array");

			debugArgs.port = config.get("port", "number");

			debugArgs.stopOnEntry = config.get("stopOnEntry", "number");

			action.debugArgs = debugArgs;

			return action;
		}
		else if (action == Task.Run && data.type == "denoDebug") {
			// Deno Debug
			let action = new TaskDebugAdapterAction("deno");

			action.command = nova.path.normalize(nova.path.join(nova.extension.path, "../../NovaChromeDebugAdapter"))

			// Debug Args
			let request = config.get("request", "string");
			if (!request) {
				request = "launch";
			}
			action.debugRequest = request;

			let debugArgs = {};

			debugArgs.type = "deno"

			debugArgs.scriptPath = config.get("scriptPath", "string");
			debugArgs.cwd = nova.workspace.path;

			let sourceRoot = config.get("sourceRoot", "string");
			if (sourceRoot) {
				if (!nova.path.isAbsolute(sourceRoot)) {
					sourceRoot = nova.path.join(nova.workspace.path, sourceRoot);
				}
			}
			else {
				sourceRoot = nova.workspace.path;
			}
			debugArgs.sourceRoot = sourceRoot;

			debugArgs.runtimeExecutable = config.get("runtimeExecutable", "string");
			debugArgs.runtimeArgs = config.get("runtimeArgs", "array");

			debugArgs.launchArgs = config.get("launchArgs", "array");

			debugArgs.port = config.get("port", "number");

			debugArgs.stopOnEntry = config.get("stopOnEntry", "number");

			action.debugArgs = debugArgs;

			return action;
		}
		else if (action == Task.Run && data.type == "nodeDebug") {
			// Node.js Debug
			let action = new TaskDebugAdapterAction("node");

			action.command = nova.path.normalize(nova.path.join(nova.extension.path, "../../NovaChromeDebugAdapter"))

			// Debug Args
			let request = config.get("request", "string");
			if (!request) {
				request = "launch";
			}
			action.debugRequest = request;

			let debugArgs = {};

			debugArgs.type = "node"

			debugArgs.scriptPath = config.get("scriptPath", "string");
			debugArgs.cwd = nova.workspace.path;

			let sourceRoot = config.get("sourceRoot", "string");
			if (sourceRoot) {
				if (!nova.path.isAbsolute(sourceRoot)) {
					sourceRoot = nova.path.join(nova.workspace.path, sourceRoot);
				}
			}
			else {
				sourceRoot = nova.workspace.path;
			}
			debugArgs.sourceRoot = sourceRoot;

			debugArgs.runtimeExecutable = config.get("runtimeExecutable", "string");
			debugArgs.runtimeArgs = config.get("runtimeArgs", "array");

			debugArgs.launchArgs = config.get("launchArgs", "array");

			debugArgs.port = config.get("port", "number");

			debugArgs.stopOnEntry = config.get("stopOnEntry", "number");

			action.debugArgs = debugArgs;

			return action;
		}
		else {
			return null;
		}
		*/
	}
}

module.exports = new ActionScriptTasksAssistant();
