const { isWorkspace } = require("./nova-utils.js");

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
	var flexSDKBase = exports.getWorkspaceOrGlobalConfig("as3mxml.sdk.framework");
	if(flexSDKBase!=null && flexSDKBase.charAt(0)=="~") {
		flexSDKBase = nova.path.expanduser(flexSDKBase);
	}

	// Since we can't use user's SDK location, try default
	if(flexSDKBase==null || (nova.fs.access(flexSDKBase, nova.fs.F_OK | nova.fs.X_OK)==false)) {
		flexSDKBase = exports.getWorkspaceOrGlobalConfig("as3mxml.sdk.default");
		if(flexSDKBase.charAt(0)=="~") {
			flexSDKBase = nova.path.expanduser(flexSDKBase);
		}
	}

	if(exports.getWorkspaceOrGlobalConfig("as3.compiler.useDefault")=="Use a specific SDK") {
		var specificSdk = exports.getWorkspaceOrGlobalConfig("as3.compiler.specificSdk");
		if(specificSdk!=null && specificSdk.charAt(0)=="~") {
			specificSdk = nova.path.expanduser(specificSdk);
		}
		if(specificSdk!=null && (nova.fs.access(specificSdk, nova.fs.F_OK | nova.fs.X_OK)!=false)) {
			flexSDKBase = specificSdk;
		}
	}

	//console.log("Setting as3mxml.sdk.framework:    " + exports.getWorkspaceOrGlobalConfig("as3mxml.sdk.framework"));
	//console.log("Setting as3mxml.sdk.default:      " + exports.getWorkspaceOrGlobalConfig("as3mxml.sdk.default"));
	//console.log("Setting as3.compiler.useDefault:  " + exports.getWorkspaceOrGlobalConfig("as3.compiler.useDefault"));
	//console.log("Setting as3.compiler.specificSdk: " + exports.getWorkspaceOrGlobalConfig("as3.compiler.specificSdk"));
	//console.log("Using flexSDKBase: " + flexSDKBase);
	return flexSDKBase;
}