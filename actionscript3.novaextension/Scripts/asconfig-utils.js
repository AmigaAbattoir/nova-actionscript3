const { showNotification, consoleLogObject, getStringOfFile } = require("./nova-utils.js");
const { determineFlexSDKBase } = require("./config-utils.js");

exports.makeASConfigFile = function() {
	const configValues = exports.gatherASConfigData();
	// This make a minimal asconfig.json.
	let asconfigContent = {
		"config": configValues.config,
		// @NOTE, haven't work on libs yet... "type": "lib",
		"compilerOptions": {
			"source-path": configValues.sourcePath,
			"output": configValues.destDir + "/" + configValues.exportName
		},
		"mainClass": configValues.mainClass, // @NOTE Should be the main file without src/ and the .as/.mxml
		"application": configValues.mainSrcDir + "/" + configValues.appXMLName,
	};
	nova.workspace.context.set("currentASConfigText",JSON.stringify(asconfigContent));
	exports.saveASConfigFile(asconfigContent);
}

exports.gatherASConfigData = function() {
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
				libPath = libPath.replace("${PROJECT_FRAMEWORKS}",determineFlexSDKBase()+"/frameworks/");
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
	consoleLogObject(configData);
	return configData;
}

exports.updateASConfigFile = function() {
	let asconfig = {};
	const asconfigText = nova.workspace.context.get("currentASConfigText");
	if(asconfigText==null) {
		return exports.makeASConfigFile();
	} else {
		asconfig = JSON.parse(asconfigText);
	}

	const configValues = exports.gatherASConfigData();

	asconfig["config"] = configValues.config;
	// @NOTE, haven't work on libs yet, but when I do, you need to set: `asconfig["type"] =  "lib"`. Maybe;
	if(asconfig["compilerOptions"]==undefined) {
		asconfig["compilerOptions"] = {};
	}
	asconfig["compilerOptions"]["source-path"] = configValues.sourcePath; ///[ "src" ];
	asconfig["compilerOptions"]["output"] = [ configValues.destDir + "/" + configValues.exportName ]; ///[ "bin/HelloAIR.swf" ];
	asconfig["compilerOptions"]["library-path"] = configValues.libraryPath///[ "libs" ];
	asconfig["mainClass"] = configValues.mainClass; ////"HelloAIR", // @NOTE Should be the main file without src/ and the .as/.mxml
	asconfig["application"] = configValues.mainSrcDir + "/" + configValues.appXMLName; /// "src/HelloAIR-app.xml"

	nova.workspace.context.set("currentASConfigText",JSON.stringify(asconfig));
	exports.saveASConfigFile(asconfig);
}

exports.loadASConfigFile = function() {
	var asconfigFileText = getStringOfFile(nova.workspace.path + "/asconfig.json","r");
	nova.workspace.context.set("currentASConfigText", asconfigFileText);
}

exports.saveASConfigFile = function(content) {
	var asconfigFile = nova.fs.open(nova.workspace.path + "/asconfig.json","w");
	asconfigFile.write(JSON.stringify(content,null,2));
	asconfigFile.close();
}
