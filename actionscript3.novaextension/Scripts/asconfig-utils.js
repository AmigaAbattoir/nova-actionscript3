const { getStringOfFile, writeJsonToFile } = require("./nova-utils.js");
const { determineFlexSDKBase, getConfigsForBuild } = require("./config-utils.js");

/**
 * Generates a minimal `asconfig.json` file to allow AS3MXML to help with code intelligence.
 */
exports.makeASConfigFile = function() {
	const configValues = getConfigsForBuild();
	// This make a minimal asconfig.json.
	let asconfigContent = {
		"config": configValues.config,
		// @NOTE, haven't work on libs yet... "type": "lib",
		"compilerOptions": {
			"source-path": configValues.sourcePath,
			"output": configValues.destDir + "/" + configValues.exportName,
			"library-path": configValues.libraryPath
		},
		"mainClass": configValues.mainClass, // @NOTE Should be the main file without src/ and the .as/.mxml
		"application": configValues.mainSrcDir + "/" + configValues.appXMLName,
	};

	exports.saveASConfigFile(asconfigContent);
}

/**
 * Updated values needed for code intelligence and saves the `asconfig.json` file.
 */
exports.updateASConfigFile = function() {
	let asconfig = {};
	const asconfigText = nova.workspace.context.get("currentASConfigText");

	// If there is no content in `currentASConfigText`, then we need to make a new one!
	if(asconfigText==null) {
		return exports.makeASConfigFile();
	} else {
		asconfig = JSON.parse(asconfigText);
	}

	const configValues = getConfigsForBuild();

	asconfig["config"] = configValues.config;
	// @NOTE, haven't work on libs yet, but when I do, you need to set: `asconfig["type"] =  "lib"`. Maybe;
	if(asconfig["compilerOptions"]==undefined) {
		asconfig["compilerOptions"] = {};
	}
	let sourceDirs = configValues.sourcePath;
	sourceDirs.unshift(configValues.mainSrcDir);

	asconfig["compilerOptions"]["source-path"] = sourceDirs;
	// asconfig needs the main source dir in the mix!
	asconfig["compilerOptions"]["output"] = configValues.destDir + "/" + configValues.exportName;
	asconfig["compilerOptions"]["library-path"] = configValues.libPaths;
	asconfig["mainClass"] = configValues.mainClass; // @NOTE Should be the main file without src/ and the .as/.mxml
	asconfig["application"] = configValues.mainSrcDir + "/" + configValues.appXMLName;

	exports.saveASConfigFile(asconfig);
}

/**
 * Loads the Workspace's `asconfig.json` and stores it to a Workspace context named
 * `currentASConfigText`.
 */
exports.loadASConfigFile = function() {
	var asconfigFileText = getStringOfFile(nova.workspace.path + "/asconfig.json","r");
	nova.workspace.context.set("currentASConfigText", asconfigFileText);
}

/**
 * Saves the Workspace's `asconfig.json` with the supplied contents and updates the Workspace
 * context variable named `currentASConfigText`.
 * @param {Object} content - The JS Object that stores the values for the asconfig file
 */
exports.saveASConfigFile = function(content) {
	nova.workspace.context.set("currentASConfigText",JSON.stringify(content));
	writeJsonToFile(nova.workspace.path + "/asconfig.json",content);
}
