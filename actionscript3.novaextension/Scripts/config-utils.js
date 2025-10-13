const { consoleLogObject, showNotification, getWorkspaceOrGlobalConfig, doesFileExist, doesFolderExistAndIsAccessible, ensureExpandedUserPath, isWorkspace } = require("./nova-utils.js");
const { getAIRSDKDefaultPath, getAIRSDKPath } = require("./sdk-utils.js");

/**
 * Figures out what the AIR/Flex SDK location is. It checks to see if it's set at the extension
 * level, then the default SDK to use, and finally if the Workspace has a specific SDK to use
 * @param {String} selectedSDK - If building/running, and the project has a custom SDK, the
 * TaskAssistant should set this. It should be the name of the SDK to use (from using the setting)
 * or it could be a path
 * @returns {String} - The location of the SDK
 */
exports.determineFlexSDKBase = function(selectedSDK = null) {
	// Check if user setup a specific SDK that should be used by the editor (like in as3mxml)
	var flexSDKBase = ensureExpandedUserPath( getWorkspaceOrGlobalConfig("as3.sdk.editor") );

	// If we don't have that, then we use the default SDKs location
	if(doesFolderExistAndIsAccessible(flexSDKBase)==false) {
		flexSDKBase = getAIRSDKDefaultPath();
	}

	// If the workspace config is different, then let's use that
	if(getWorkspaceOrGlobalConfig("as3.compiler.sdk")) {
		var specificSdk = getAIRSDKPath(getWorkspaceOrGlobalConfig("as3.compiler.sdk"));
		if(doesFolderExistAndIsAccessible(specificSdk)) {
			flexSDKBase = specificSdk;
		} else {
			showNotification("Could not find project specific AIR SDK", "Please check your installed SDKs. Could not find specific specific AIR SDK at:\n " + specificSdk + "\n using default of:\n " + flexSDKBase, "Oh no!");
		}
	}

	// If there a task assigned SDK, that's what we're using!
	if(selectedSDK) {
		selectedSDK = getAIRSDKPath(selectedSDK);
		if(doesFolderExistAndIsAccessible(selectedSDK)) {
			flexSDKBase = selectedSDK;
		} else {
			showNotification("Could not find specific AIR SDK", "Could not find or use the task's specific AIR SDK at:\n " + selectedSDK + "\n will atempt to use:\n " + flexSDKBase, "Oh no!");
		}
	}

console.log(" USING SDK AT: " + flexSDKBase);

	// Set context variable to keep track of it later @NOTE Not sure we need this.
	currentSDKPath = flexSDKBase;
	nova.workspace.context.set("currentSDKPath", currentSDKPath);

	console.log("Setting as3.sdk.installed[0]:      " + getWorkspaceOrGlobalConfig("as3.sdk.installed")[0]);
	console.log("Setting as3.compiler.sdk: " + getWorkspaceOrGlobalConfig("as3.compiler.sdk"));
	console.log("From Task at hand: " + selectedSDK);
	console.log("Using flexSDKBase ------->>>>>> : " + flexSDKBase);
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
	androidSDKBase = ensureExpandedUserPath(androidSDKBase);

	//console.log("Using androidSDKBase: " + androidSDKBase);
	return androidSDKBase;
}

/**
 * Get a bunch of configurations that are needed to export a package
 * @param {String} file - The name of the main application file (if different than the Workspace's
 * configuration)
 * @returns {Object} - Various configs that are needed when packaging a build
 */
exports.getConfigsForPacking = function(file, appendWorkspacePath = false, configOverrides = {}) {
	var sdkBase = "";
	if(configOverrides.sdkBase!=null) {
		sdkBase = configOverrides.sdkBase;
	}
	const flexSDKBase = exports.determineFlexSDKBase(sdkBase);
	const doTimestamp = nova.workspace.config.get("as3.packaging.timestamp");
	const timestampURL = nova.workspace.config.get("as3.packaging.timestampUrl");

	//const isFlex = nova.workspace.config.get("as3.application.isFlex");
	var mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
	if(configOverrides.mainApplicationPath) {
		// console.log("  XXXXXX OVERRIDING - MAIN APP PATH!");
		mainApplicationPath = configOverrides.mainApplicationPath;
	}

	var mainSrcDir = nova.workspace.config.get("as3.build.source.main");
	// If empty, we are assuming there is a `src/`...
	if(mainSrcDir=="") {
		mainSrcDir = "src";
	}
	// If it's a dot slash, we can officially make it empty!
	if(mainSrcDir=="./") {
		mainSrcDir = "";
	}
	mainSrcDir = ensureExpandedUserPath(mainSrcDir); // If a user shortcut, resolve

	if(appendWorkspacePath) {
		mainSrcDir = nova.path.join(nova.workspace.path, mainSrcDir);
	}

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
		"mainSrcDir": mainSrcDir,
		"packageName": packageName,
		"appXMLName": appXMLName,
		"doTimestamp": doTimestamp,
		"timestampURL": timestampURL
	};

	if(nova.inDevMode()) {
		// console.log("*** ---===[ Here are the packaging settings from the project ]===--- ***");
		// consoleLogObject(configData);
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

	const exportName = file.replace(/\.(mxml|as)$/i, ".swf");
	const appXMLName = file.replace(/\.(mxml|as)$/i, "-app.xml");

	const configData = {
		"exportName": exportName,
		"appXMLName": appXMLName,
	};

	if(nova.inDevMode()) {
		// console.log("*** ---===[ Here are the app xml and export names settings from the project ]===--- ***");
		// consoleLogObject(configData);
	}

	return configData;
}

/**
 * Checks settings and generates a bunch of options that are needed for building a project
 * @param {boolean} appendWorkspacePath - If we need to append the Workspace's path to items
 * Generally, false for the `asconfig.json`.
 * @returns {Object} - Loads of settings that are needed for building the project
 */
exports.getConfigsForBuild = function(appendWorkspacePath = false, configOverrides = {}) {
	// console.log("appendWorkspacePath: " + appendWorkspacePath);
	var sdkBase = "";
	if(configOverrides.sdkBase!=null) {
		sdkBase = configOverrides.sdkBase;
	}
	var flexSDKBase = exports.determineFlexSDKBase(sdkBase);

	var mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
	if(configOverrides.mainApplicationPath) {
		// console.log("  XXXXXX OVERRIDING - MAIN APP PATH!");
		mainApplicationPath = configOverrides.mainApplicationPath;
	}

	const mainClass = mainApplicationPath.replace(".mxml","").replace(".as","");

	var mainSrcDir = nova.workspace.config.get("as3.build.source.main");
	// If empty, we are assuming there is a `src/`...
	if(mainSrcDir=="") {
		mainSrcDir = "src";
	}
	// If it's a dot slash, we can officially make it empty!
	if(mainSrcDir=="./") {
		mainSrcDir = "";
	}
	mainSrcDir = ensureExpandedUserPath(mainSrcDir); // If a user shortcut, resolve

	if(appendWorkspacePath) {
		mainSrcDir = nova.path.join(nova.workspace.path, mainSrcDir);
	}

	var sourcePath = [];
	const sourceDirs = nova.workspace.config.get("as3.build.source.additional");
//	sourcePath.push(mainSrcDir);
	if(sourceDirs) {
		sourceDirs.forEach((sourceDir) => {
			sourceDir = ensureExpandedUserPath(sourceDir);  // If a user shortcut, resolve
			if(sourceDir.includes("${PROJECT_FRAMEWORKS}")) {
				sourceDir = sourceDir.replace("${PROJECT_FRAMEWORKS}",flexSDKBase+"/frameworks");
			}
			sourcePath.push(sourceDir);
		});
	}

	const libPaths = nova.workspace.config.get("as3.build.library.additional");
	var libraryPaths = [];
	if(libPaths) {
		libPaths.forEach((libPath) => {
			libPath = ensureExpandedUserPath(libPath); // If a user shortcut, resolve
			if(libPath.includes("${PROJECT_FRAMEWORKS}")) {
				libPath = libPath.replace("${PROJECT_FRAMEWORKS}",flexSDKBase+"/frameworks");
			}
			if(libPath.includes("{locale}")) {
				/** @TODO Need to figure out how to get locale... Maybe a setting in the extension or preferences */
				libPath = libPath.replace("{locale}","en_US");
			}
			libraryPaths.push(libPath);
		});
	}

	var anes = nova.workspace.config.get("as3.build.anes"); // Reminder, it's build.anes for the project, Task configs use packaging.anes...
	if(configOverrides.anes) {
		anes = configOverrides.anes;
	}
	var anePaths = [];
	if(anes) {
		anes.forEach((ane) => {
			if(ane!="") {
				anePaths.push( ensureExpandedUserPath(ane) );
			}
		})
	}

	var destDir = nova.workspace.config.get("as3.build.output");
	if(configOverrides.releasePath) {
		// console.log("  XXXXXX OVERRIDING - DEST DIR!");
		destDir = configOverrides.releasePath;
	}

	// If empty, we will assume the default of bin-debug...
	if(destDir=="") {
		destDir = "bin-debug";
	}
	// If it's a dot slash, we can officially make it empty!
	if(destDir=="./") {
		destDir = "";
	}
	destDir = ensureExpandedUserPath(destDir); // If a user shortcut, resolve

	if(appendWorkspacePath) {
		if(destDir.charAt(0)!="/") {
			destDir = nova.path.join(nova.workspace.path, destDir);
		}
	}

	// Library only stuff
	const linkage = nova.workspace.config.get("as3.build.linkage");
	const componentSet = nova.workspace.config.get("as3.build.componentSet");

	const isFlex = nova.workspace.config.get("as3.application.isFlex");

	const appAndExportName = exports.getAppXMLNameAndExport(mainApplicationPath);
	var exportName = appAndExportName.exportName;
	if(configOverrides.exportName) {
		// console.log("  XXXXXX OVERRIDING - exportName!");
		exportName = configOverrides.exportName;
	}
	var appXMLName = appAndExportName.appXMLName;
	if(configOverrides.appXMLName) {
		// console.log("  XXXXXX OVERRIDING - appXMLName!");
		appXMLName = configOverrides.appXMLName;
	}

	const copyAssets = nova.workspace.config.get("as3.compiler.copy");

	const compilerAdditional = nova.workspace.config.get("as3.compiler.additional");

	const configData = {
		"config": "airmobile",
		"sourceDirs": sourceDirs,  // Needed for additional sources (may be relative) mostly for asconfig
		"sourcePath":  sourcePath, // Full (resolved) path of files for building
		"libPaths": libraryPaths,
		"anes": anePaths,
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
		"copyAssets": copyAssets,
		"compilerAdditional": compilerAdditional,
		// Used by library building
		"linkage": linkage,
		"componentSet": componentSet
	};

	if(nova.inDevMode()) {
		// console.log("*** ---===[ Here are the building settings from the project ]===--- ***");
		// consoleLogObject(configData);
	}

	return configData;
}

