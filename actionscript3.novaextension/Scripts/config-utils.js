const { consoleLogObject } = require("./nova-utils.js");
const { showNotification, isWorkspace } = require("./nova-utils.js");

exports.getWorkspaceOrGlobalConfig = function(configName) {
	var config = nova.config.get(configName);
	//console.log("*** getWorkspaceOrGlobalConfig() Config " + configName + " is [" + config + "]");
	if(exports.isWorkspace()) {
		workspaceConfig = nova.workspace.config.get(configName)
	//console.log("*** getWorkspaceOrGlobalConfig() Workspace Config " + configName + " is [" + workspaceConfig + "]");
		if(workspaceConfig) {
			config = workspaceConfig;
		}
	}
	//console.log("*** getWorkspaceOrGlobalConfig() RETURNING [" + config + "]");
	return config;
}

/**
 * Tell if the current file is being used in a workspace setting or as a independent editor window
 *
 * @see https://github.com/jasonplatts/nova-todo/blob/main/Scripts/functions.js
 * @returns {boolean}  - representing whether or not the current environment is a workspace or
 * Nova window without a workspace.
 */
exports.isWorkspace = function() {
	if (nova.workspace.path == undefined || nova.workspace.path == null) {
		// Opening single file in a Nova editor does not define a workspace. A project must exist.
		// Opening a remote server environment is also not considered a workspace.
		return false
	} else {
		// A local project is the only environment considered a Nova workspace.
		return true
	}
}

exports.determineFlexSDKBase = function() {
	// Check if user setup the location of the SDK for this project
	var flexSDKBase = exports.getWorkspaceOrGlobalConfig("as3.sdk.framework");
	if(flexSDKBase!=null && flexSDKBase.charAt(0)=="~") {
		flexSDKBase = nova.path.expanduser(flexSDKBase);
	}

	// Since we can't use user's SDK location, try default
	if(flexSDKBase==null || (nova.fs.access(flexSDKBase, nova.fs.F_OK | nova.fs.X_OK)==false)) {
		flexSDKBase = exports.getWorkspaceOrGlobalConfig("as3.sdk.default");
		if(flexSDKBase.charAt(0)=="~") {
			flexSDKBase = nova.path.expanduser(flexSDKBase);
		}
	}

	if(exports.getWorkspaceOrGlobalConfig("as3.compiler.useDefault")=="Use a specific SDK") {
		var specificSdk = exports.getWorkspaceOrGlobalConfig("as3.compiler.specificSdk");
		if(specificSdk!=null) {
			if(specificSdk.charAt(0)=="~") {
				specificSdk = nova.path.expanduser(specificSdk);
			}

			if(nova.fs.access(specificSdk, nova.fs.F_OK | nova.fs.X_OK)!=false) {
				flexSDKBase = specificSdk;
			} else {
				showNotification("Could not find specific AIR SDK", "Could not find specific AIR SDK at\n " + specificSdk + ", using default of " + flexSDKBase, "Oh no!");
			}
		}
	}

	//console.log("Setting as3.sdk.framework:    " + exports.getWorkspaceOrGlobalConfig("as3.sdk.framework"));
	//console.log("Setting as3.sdk.default:      " + exports.getWorkspaceOrGlobalConfig("as3.sdk.default"));
	//console.log("Setting as3.compiler.useDefault:  " + exports.getWorkspaceOrGlobalConfig("as3.compiler.useDefault"));
	//console.log("Setting as3.compiler.specificSdk: " + exports.getWorkspaceOrGlobalConfig("as3.compiler.specificSdk"));
	//console.log("Using flexSDKBase: " + flexSDKBase);
	return flexSDKBase;
}

exports.getConfigsForBuild = function() {
	const mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
	const mainClass = mainApplicationPath.replace(".mxml","").replace(".as","");

	var mainSrcDir = nova.workspace.config.get("as3.build.source.main");
	if(mainSrcDir=="") {
		mainSrcDir = "src";
	}

	const sourceDirs = nova.workspace.config.get("as3.build.source.additional");

	var sourcePath = [];
	sourcePath.push(mainSrcDir);
	if(sourceDirs) {
		sourceDirs.forEach((sourceDir) => {
			if(sourceDir.charAt(0)=="~") { // If a user shortcut, resolve
				sourceDir = nova.path.expanduser(sourceDir);
			}
			if(sourceDir.includes("${PROJECT_FRAMEWORKS}")) {
				sourceDir = sourceDir.replace("${PROJECT_FRAMEWORKS}",flexSDKBase+"/frameworks/");
			}
			sourcePath.push(sourceDir);
		});
	}

	var libraryPath = [];
	const libPaths = nova.workspace.config.get("as3.build.library.additional");
	if(libPaths) {
		libPaths.forEach((libPath) => {
			// @NOTE, not sure this is needed, but it may come in handy
			if(libPath.includes("${PROJECT_FRAMEWORKS}")) {
				libPath = libPath.replace("${PROJECT_FRAMEWORKS}",exports.determineFlexSDKBase()+"/frameworks/");
			}
			if(libPath.includes("{locale}")) {
				/** @TODO Need to figure out how to get locale... Maybe a setting in the extension or preferences */
				libPath = libPath.replace("{locale}","en_US");
			}
			libraryPath.push(libPath);
		});
	}

	var destDir = nova.workspace.config.get("as3.build.output");
	if(destDir=="") {
		destDir = "bin-debug";
	}

	const isFlex = nova.workspace.config.get("as3.application.isFlex");
	const exportName = (isFlex ? mainApplicationPath.replace(".mxml",".swf") : mainApplicationPath.replace(".as",".swf"));
	const appXMLName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));

	const configData = {
		"config": "airmobile",
		"sourcePath":  sourcePath,
		"destDir": destDir,
		"exportName": exportName,
		"mainClass": mainClass,
		"mainSrcDir": mainSrcDir,
		"appXMLName": appXMLName
	};

	if(nova.inDevMode()) {
		consoleLogObject(configData);
	}

	return configData;
}

