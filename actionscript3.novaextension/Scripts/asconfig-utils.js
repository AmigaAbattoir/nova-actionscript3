const { getStringOfFile } = require("./nova-utils.js");
const { determineFlexSDKBase, getConfigsForBuild } = require("./config-utils.js");

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
	nova.workspace.context.set("currentASConfigText",JSON.stringify(asconfigContent));
	exports.saveASConfigFile(asconfigContent);
}

exports.updateASConfigFile = function() {
	let asconfig = {};
	const asconfigText = nova.workspace.context.get("currentASConfigText");
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
