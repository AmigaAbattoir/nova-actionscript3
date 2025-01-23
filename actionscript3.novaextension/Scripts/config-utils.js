const { consoleLogObject, showNotification, isWorkspace } = require("./nova-utils.js");

/**
 * Returns a config, first checking for the extension, then if there is a Workspace value
 * @param {String} configName - The key of the configuration to get
 */
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

/**
 * Figures out what the AIR/Flex SDK location is. It checks to see if it's set at the extension
 * level, then the default SDK to use, and finally if the Workspace has a specific SDK to use
 * @returns {String} - The location of the SDK
 */
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

/**
 * Figures out the location of the Android SDK. Checking if there is a preference set, otherwise
 * it defaults to where Android SDKs are usually stored.
 * @returns {String} - The location of the Android SDK
 */
exports.determineAndroidSDKBase = function() {
		// Get the Android SDK and call ADB since it give more details about devices attached
	let androidSDKBase = nova.workspace.config.get("as3.sdk.android");
	if(!androidSDKBase) {
		androidSDKBase = "~/Library/Android/sdk/";
	}
	if(androidSDKBase!=null) {
		if(androidSDKBase.charAt(0)=="~") {
			androidSDKBase = nova.path.expanduser(androidSDKBase);
		}
	}

	//console.log("Using androidSDKBase: " + androidSDKBase);
	return androidSDKBase;
}

/**
 * Get a bunch of configurations that are needed to export a package
 * @param {String} file - The name of the main application file (if different than the Workspace's
 * configuration)
 * @returns {Object} - Various configs that are needed when packaging a build
 */
exports.getConfigsForPacking = function(file) {
	const flexSDKBase = exports.determineFlexSDKBase();
	const doTimestamp = nova.workspace.config.get("as3.packaging.timestamp");
	const timestampURL = nova.workspace.config.get("as3.packaging.timestampUrl");

	//const isFlex = nova.workspace.config.get("as3.application.isFlex");
	const mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");

	// If there is a different file for the mainApplication
	if(!file) {
		file = mainApplicationPath;
	}
	const appAndExportName = exports.getAppXMLNameAndExport(file);
	const exportName = appAndExportName.exportName;
	const appXMLName = appAndExportName.appXMLName;
	const packageName = exportName.replace(".swf",".air");

	const configData = {
		"flexSDKBase": flexSDKBase,
		"packageName": packageName,
		"appXMLName": appXMLName,
		"doTimestamp": doTimestamp,
		"timestampURL": timestampURL
	};

	if(nova.inDevMode()) {
		console.log("*** ---===[ Here are the packaging settings from the project ]===--- ***");
		consoleLogObject(configData);
	}

	return configData;
}

/**
 * Figures out the export and appXMLName based on the file given.
 * @param {String} file - The name of the main file that is being built
 * @returns {Object} - An object with the exportName and appXMLName
 */
exports.getAppXMLNameAndExport = function(file) {
	/* @TODO Strip to last part, remove any src/ or path prior to it */
	const isFlex = nova.workspace.config.get("as3.application.isFlex");

	const exportName = (isFlex ? file.replace(".mxml",".swf") : file.replace(".as",".swf"));
	const appXMLName = (isFlex ? file.replace(".mxml","-app.xml") : file.replace(".as","-app.xml"));

	const configData = {
		"exportName": exportName,
		"appXMLName": appXMLName,
	};

	if(nova.inDevMode()) {
		console.log("*** ---===[ Here are the app xml and export names settings from the project ]===--- ***");
		consoleLogObject(configData);
	}

	return configData;
}

/**
 * Checks settings and generates a bunch of options that are needed for building a project
 * @param {boolean} appendWorkspacePath - If we need to append the Workspace's path to items
 * Generally, false for the `asconfig.json`.
 * @returns {Object} - Loads of settings that are needed for building the project
 */
exports.getConfigsForBuild = function(appendWorkspacePath = false) {
	// console.log("appendWorkspacePath: " + appendWorkspacePath);
	const flexSDKBase = exports.determineFlexSDKBase();

	const mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
	const mainClass = mainApplicationPath.replace(".mxml","").replace(".as","");

	var mainSrcDir = nova.workspace.config.get("as3.build.source.main");
	if(mainSrcDir=="") {
		mainSrcDir = "src";
	}
	if(appendWorkspacePath) {
		mainSrcDir = nova.path.join(nova.workspace.path, mainSrcDir);
	}

	var sourcePath = [];
	const sourceDirs = nova.workspace.config.get("as3.build.source.additional");
//	sourcePath.push(mainSrcDir);
	if(sourceDirs) {
		sourceDirs.forEach((sourceDir) => {
			if(sourceDir.charAt(0)=="~") { // If a user shortcut, resolve
				sourceDir = nova.path.expanduser(sourceDir);
			}
			if(sourceDir.includes("${PROJECT_FRAMEWORKS}")) {
				sourceDir = sourceDir.replace("${PROJECT_FRAMEWORKS}",flexSDKBase+"/frameworks/");
			}
			/** @TODO Check if it starts with ~, or a "/", then don't merge with workspace! */
			sourcePath.push(sourceDir);
		});
	}

	const libPaths = nova.workspace.config.get("as3.build.library.additional");
	var libraryPaths = [];
	if(libPaths) {
		libPaths.forEach((libPath) => {
			// @NOTE, not sure this is needed, but it may come in handy
			if(libPath.includes("${PROJECT_FRAMEWORKS}")) {
				libPath = libPath.replace("${PROJECT_FRAMEWORKS}",flexSDKBase+"/frameworks/");
			}
			if(libPath.includes("{locale}")) {
				/** @TODO Need to figure out how to get locale... Maybe a setting in the extension or preferences */
				libPath = libPath.replace("{locale}","en_US");
			}
			libraryPaths.push(libPath);
		});
	}

	var anePaths = nova.workspace.config.get("as3.build.anes");

	var destDir = nova.workspace.config.get("as3.build.output");
	if(destDir=="") {
		if(appendWorkspacePath) {
			destDir = nova.path.join(nova.workspace.path, "bin-debug");
		} else {
			destDir = "bin-debug";
		}
	} else {
		/** @TODO Check if it starts with ~, or a "/", then don't merge with workspace! */
		if(appendWorkspacePath) {
			destDir = nova.path.join(nova.workspace.path, destDir);
		}
		//console.log("Using configed DEST DIR " + destDir);
	}

	const isFlex = nova.workspace.config.get("as3.application.isFlex");

	const appAndExportName = exports.getAppXMLNameAndExport(mainApplicationPath);
	const exportName = appAndExportName.exportName;
	const appXMLName = appAndExportName.appXMLName;

	const copyAssets = nova.workspace.config.get("as3.compiler.copy");

	const compilerAdditional = nova.workspace.config.get("as3.compiler.additional");

	const configData = {
		"config": "airmobile",
		"sourceDirs": sourceDirs,  // Needed for additional sources (may be relative) mostly for asconfig
		"sourcePath":  sourcePath, // Full (resolved) path of files for building
		"libPaths": libraryPaths,
		"anePaths": anePaths,
		"destDir": destDir,
		"exportName": exportName,
		"mainClass": mainClass,
		"mainSrcDir": mainSrcDir,
		"appXMLName": appXMLName,
		// Used by extension for building
		"mainApplicationPath": mainApplicationPath,
		"flexSDKBase": flexSDKBase,
		"isFlex": isFlex,
		"appXMLName": appXMLName,
		"copyAssets": copyAssets
	};

	if(nova.inDevMode()) {
		console.log("*** ---===[ Here are the building settings from the project ]===--- ***");
		consoleLogObject(configData);
	}

	return configData;
}

