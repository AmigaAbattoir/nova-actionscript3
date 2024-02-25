const pjXML = require('pjxml');
const { getTag, getTagAttribute, getAttribute } = require("./xml-utils.js");
const { showNotification, getProcessResults, saveAllFiles, consoleLogObject, rangeToLspRange } = require("./nova-utils.js");
const { getWorkspaceOrGlobalConfig, isWorkspace, determineFlexSDKBase } = require("./config-utils.js");
const { determineProjectUUID, resolveStatusCodeFromADT } = require("./as3-utils.js");

var fileExtensionsToExclude = [];
var fileNamesToExclude = [];

function shouldIgnoreFileName(fileName, ignorePatterns) {
	if(fileNamesToExclude.includes(fileName)) {
		return true;
	}
	if(fileExtensionsToExclude.some(ext => fileName.endsWith(ext))) {
		return true;
	}
	return false;
}

exports.ActionScript3TaskAssistant = class ActionScript3TaskAssistant {
	/** @TODO Make this an extension preference, like in Flash Builder > File Exclusions */
	// These files should be ignored when copying assets. The "-app.xml" gets processed,
	// so we won't want to copy that either.
	ignoreCopy = [ ".java", ".class", ".properties", ".mxml", ".as", ".fxg",
		".classpath", "flex-config.xml", "air-config.xml", "services-config.xml", "remoting-config.xml", "proxy-config.xml", "massaging-config.xml", "data-management-config.xml",
		// Also, ignore these things.
		".git",".svn",".DS_Store", "-app.xml"
	];

	/**
	 * Clean the build directory. Basically, delete the dir then make it again.
	 * @param {string} outputPath - Where the build folder is located.
	 */
	clean(outputPath) {
		var result = true;
		if(outputPath) {
			try {
				nova.fs.rmdir(outputPath);
				nova.fs.mkdir(outputPath);
			} catch(error) {
				result = false;
			}
		}
		return result;
	}

	/**
	 * Handles packaging the project
	 */
	packageBuild() {
		// We need a project UUID to save the certificate password in a later step, but let's check
		// first. It should generate one if possible, but on the unlikely event, we should abort.
		var projectUUID = determineProjectUUID();
		projectUUID.then((resolve) => { // Now that we have the UUID, let's try to make a build
			var mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
			var appXMLName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));

			// Use this to get setting from the extension or the workspace!
			var flexSDKBase = determineFlexSDKBase();

			var mainSrcDir = nova.path.join(nova.workspace.path, nova.workspace.config.get("as3.build.source.main"));

			var isFlex = nova.workspace.config.get("as3.application.isFlex");
			var exportName = (isFlex ? mainApplicationPath.replace(".mxml",".swf") : mainApplicationPath.replace(".as",".swf"));
			var packageName = (isFlex ? mainApplicationPath.replace(".mxml",".air") : mainApplicationPath.replace(".as",".air"));

			var copyAssets = nova.workspace.config.get("as3.compiler.copy");

			var sourceDirs = nova.workspace.config.get("as3.build.source.additional");

			var libPaths = nova.workspace.config.get("as3.build.library.additional");

			var libPaths = nova.workspace.config.get("as3.build.library.additional");

			var releasePath = "bin-release-temp";

			this.build(true, mainSrcDir, mainApplicationPath, sourceDirs, libPaths, appXMLName, flexSDKBase, "release", nova.path.join(nova.workspace.path, releasePath), exportName, true).then((resolve) => {
				console.log("this.build() resolve:");
				consoleLogObject(resolve);
				// @TODO - If there is warnings, ask if you want to continue, or abort.

				// Loop through the output, and copy things unless specified to exclude like the .actionScriptProperties
				let alsoIgnore = getWorkspaceOrGlobalConfig("as3.packaging.excludedFiles");
				//console.log("alsoIgnore: ");
				//consoleLogObject(alsoIgnore);
				if(alsoIgnore) {
					alsoIgnore.forEach((ignore) => {
						//console.log("Ignroe: " + ignore);
						//console.log("[["+nova.workspace.path + "/" + releasePath + "/" + ignore +"]]");
						try{
							if(nova.fs.stat(nova.workspace.path + "/" + releasePath + "/" + ignore).isFile()) {
								//console.log("    REMOVE FILE + " + ignore + " !");
								nova.fs.remove(nova.workspace.path + "/" + releasePath + "/" + ignore);
							} else if(nova.fs.stat(nova.workspace.path + "/" + releasePath + "/" + ignore).isDirectory()) {
								//console.log("    REMOVE DIR + " + ignore + " !");
								nova.fs.rmdir(nova.workspace.path + "/" + releasePath + "/" + ignore);
							} else {
								//console.log("    Don't do anything " + ignore + " !");
							}
						} catch(error) {
							// @TODO, Flash Builder would remove this entry from the excluded items
							//console.log("    Not there skip " + error);
						}
						//console.log("DONE!");
					});
				}

				// Check for password, if no, show password.
				// @TODO We should do something like FB where when you enter the password, it tries to verify it. Once it's correct, you can continue.
				var passwordCheck = nova.credentials.getPassword(projectUUID,"release-build");
				if(passwordCheck==null) {
					passwordCheck = "";
				}

				// THis will be a promise, I promise!
				var passwordGet;

				// If password is empty, let's try to get it.
				if(passwordCheck=="") {
					var request = new NotificationRequest("Export Release Build...");
					request.title = "Digital Signature ";
					request.body = "Enter the password for the certificate " + nova.workspace.config.get("as3.packaging.password") ;
					request.textInputValue = passwordCheck;
					request.type = "input";
					request.actions = ["This time", "Save", "Cancel"];

					passwordGet = nova.notifications.add(request);
				} else {
					// We have a password, fufill the promise
					passwordGet = Promise.resolve( { identifier: "Export Release Build...", actionIdx: 0, textInputValue: passwordCheck });
				}

				passwordGet.then((reply) => {
					var password;
					switch(reply.actionIdx) {
						case 2: { // Cancel
							console.log("Cancel");
							// @TODO Ask to remove build?
							return;
							break;
						}
						case 1: { // Save the password
							password = reply.textInputValue;
							// @NOTE Should we also tie in the certificate name? Only useful if using different certificates I guess.
							nova.credentials.setPassword(projectUUID,"release-build",password);
							break;
						}
						case 0: { // This time
							password = reply.textInputValue;
							break;
						}
					}

					var command = flexSDKBase + "/bin/adt";
					var args = [];

					args.push("-package");

					args.push("-storetype");
					args.push("pkcs12");

					args.push("-keystore");
					args.push(nova.workspace.config.get("as3.packaging.certificate"));

					args.push("-storepass");
					args.push(password);

					var doTimestamp = nova.workspace.config.get("as3.packaging.timestamp");
					if(doTimestamp==false) {
						args.push("-tsa");
						args.push("none");
					}

					// AIR Package name
					args.push(packageName);

					// Descriptor
					args.push(releasePath + "/" + appXMLName);

					// Loop through each item in the releasePath, and if it's not the app.xml, copy it to the packing
					nova.fs.listdir(nova.workspace.path + "/" + releasePath).forEach(filename => {
						if(filename!=appXMLName) {
							args.push("-C");
							args.push(releasePath);
							args.push(filename);
						}
					});

					args.unshift(command);
					var process = new Process("/usr/bin/env", {
						args: args,
						cwd: nova.workspace.path
					});

					consoleLogObject(process);
					if (nova.inDevMode()) {
						console.log(" *** COMMAND [[" + command + "]] ARG: \n");
						consoleLogObject(args);
					}

					var stdout = "";
					var stderr = "";
					process.onStdout(function(line) {
						//console.log("STDOUT: " + line);
						stdout += line;
					});
					process.onStderr(function(line) {
						//console.log("STDERR: " + line);
						stderro += line;
					});
					process.start();
					process.onDidExit((status) => {
						consoleLogObject(status);
						var title = "Export Package";
						var message = "Okay?!!!";
						if(status==0) {
							showNotification("Export Package Successful!", "Congrats!");

							// @TODO, add button to reveal path
							//nova.fs.rmdir(nova.path.join(nova.workspace.path, "bin-release-temp"));
						} else {
							var result = resolveStatusCodeFromADT(status);
							title = result.title;
							message = result.message;
						}
						showNotification(title, message, "Oh no!");
					})
				}, error => {
					console.log("passwordGet.then((error): ");
					showNotification("Password failed!", "Something happened when trying to use or save the pasword!", "That's odd");
				},(reject) => {
					console.log("passwordGet.then((reject): ");
					showNotification("Password failed!", "rej" + reject, "Booo!!");
				});
			}, (reject) => {
				// To make this a little neater, remove the workspace's path from the stderr messages
				var message = reject.stderr.replaceAll(nova.workspace.path,"");
				showNotification("Export Release Build failed!", "One or errors were found while trying to build the release version. Unable to export.\n" + message, "Uht oh!");
			});
		}, (reject) => {
			showNotification("Project UUID Missing", reject + "\nPlease use the Import Flash Builder option in the menu, or ensure that `uuidgen` is on your system's path!","Uht oh!");
		});
	}

	/**
	 * Builds the SWF for the project
	 * @param {bool} copyAssets - If we should copy assets to the destination
	 * @param {string} mainSrcDir - The main source folder (where the main class or app.xml is)
	 * @param {string} mainApplicationPath - The path to the
	 * @param {Array} sourceDirs - Any additional paths that need to be included in the project
	 * @param {Array} libPaths - Any additional library paths that need to be included
	 * @param {string} appXMLName - The name of the app.xml file
	 * @param {string} flexSDKBase - The location of the Flex SDK
	 * @param {string} whatKind - What kind of build, either `release`|`debug`
	 * @param {string} destDir - The destination to save the build to
	 * @param {string} exportName - The name of the exported file
	 * @param {boolean} packageAfterBuild - If true, we are going to return the process of building
	 * as a Promise, otherwise a standard Nova Task that it can handle
	 */
	build(copyAssets, mainSrcDir, mainApplicationPath, sourceDirs, libPaths, appXMLName, flexSDKBase, whatKind, destDir, exportName, packageAfterBuild = false) {
		if(copyAssets) { // Copy each source dir to the output folder
			console.log("copyAssets Begins!");
			fileNamesToExclude = getWorkspaceOrGlobalConfig("as3.fileExclusion.names");
			fileNamesToExclude.push(appXMLName);
			fileExtensionsToExclude = getWorkspaceOrGlobalConfig("as3.fileExclusion.extensions");
			var copyDirs = sourceDirs.concat(mainSrcDir);
			if(copyDirs!=null) {
				copyDirs.forEach((copyDir) => {
					if(copyDir.charAt(0)=="~") { // If a user shortcut, resolve
						copyDir = nova.path.expanduser(copyDir);
					} else if(copyDir.charAt(0)!="/") { // If it's not a slash, it's relative to the workspace path
						copyDir = nova.path.join(nova.workspace.path, copyDir);
				   }
				   this.copyAssetsOf(copyDir, destDir, packageAfterBuild);
				});
			}
		}

		// FlashBuilder would modify the -app.xml with updated variables, so we will make a copy of the file, changing what FB would
		// Otherwise, this will write a copy.
		var appXML;
		console.log("AppXML location: " + appXMLName);
		try{
			appXML = nova.fs.open(nova.path.join(mainSrcDir, appXMLName))
		} catch(error) {
			console.log("Error opening APP XML! ",error);
			return null;
		}

		var newAppXML = nova.fs.open(destDir + "/" + appXMLName, "w");
		console.log("newAppXML location: " + destDir + "/" + appXMLName);
		if(appXML) {
			var line;
			var lineCount = 0;
			try {
				do {
					line = appXML.readline();
					//console.log(" READING LINE: " + line);
					lineCount++;
					if(line.indexOf("[This value will be overwritten by Flash Builder in the output app.xml]")!=-1) {
						line = line.replace("[This value will be overwritten by Flash Builder in the output app.xml]",exportName);
						//console.log(" REPLACING FB LINE: " + line);
					}
					newAppXML.write(line);
				} while(line && line.length>0);
				appXML.close();
			} catch(error) {
				if(lineCount==0) {
					console.log("*** ERROR: No APP XML file! error: ",error);
					consoleLogObject(error);
				}
			}
		}
		console.log("DONE!!");

		// Let's compile this thing!!
		var command = flexSDKBase + "/bin/mxmlc";
		var args = new Array();
		if(whatKind=="debug") {
			args.push("--debug=true");
		}

		args.push("--warnings=true");

		// If air, we need to add the configname=air, I'm assuming flex would be different?!
		args.push("+configname=air");

		// Push where the final SWF will be outputted
		args.push("--output=" + destDir + "/" + exportName);

		// Push args for the source-paths!
		if(sourceDirs) {
			sourceDirs.forEach((sourceDir) => {
				if(sourceDir.charAt(0)=="~") { // If a user shortcut, resolve
					sourceDir = nova.path.expanduser(sourceDir);
				}
				if(sourceDir.includes("${PROJECT_FRAMEWORKS}")) {
					console.log("Change project frameworks!!!");
					sourceDir = sourceDir.replace("${PROJECT_FRAMEWORKS}",flexSDKBase);
				}
				args.push("--source-path+=" + sourceDir);
			});
		}

		// This too should be from settings
		if(libPaths) {
			libPaths.forEach((libPath) => {
				/*
				// @NOTE, not sure this is needed, but it may come in handy
				if(libPath.includes("${PROJECT_FRAMEWORKS}")) {
					libPath = libPath.replace("${PROJECT_FRAMEWORKS}",flexSDKBase);
				}
				//
				// Actually, if it's wrong, it's wrong. That shouldn't be skipped
				try {
					var checkPath = libPath;
					if(libPath.charAt(0)=="~") { // If a user shortcut, resolve
						checkPath = nova.path.expanduser(libPath);
					} else if(libPath.charAt(0)!="/") { // If it's not a slash, it's relative to the workspace path
						checkPath = nova.path.join(nova.workspace.path, libPath);
					}

					if(nova.fs.stat(checkPath).isDirectory()) {
						args.push("--library-path+=" + libPath);
					}
				} catch(error) {
					//console.log("Lib folder not found! ERROR: " + error)
				}
				*/
				args.push("--library-path+=" + libPath);
			});
		}

		// Additional compiler arguments
		if(nova.workspace.config.get("as3.compiler.additional")!=null) {
			/** @NOTE Needs work on parsing the additional args.
				Should really parse to make sure that there are no spaces or dash spaces
				Or make sure there's a quote around it if there's paths, or maybe just a
				space after an equal sign.
			*/
			var additional = nova.workspace.config.get("as3.compiler.additional");
			var ops = additional.split(" -");
			ops.forEach((addition,index) => {
				additional = (index>0 ? "-" : "") + addition;

				var eqLoc = addition.indexOf("=");
				var spaceLoc = addition.indexOf(" ");

				// Should handle something like "-locale en_US"
				if(eqLoc==-1 && spaceLoc!=-1) {
					var moreArgs = addition.split(" ");
					args.push(moreArgs[0]); 
					args.push(moreArgs[1]); 
				} else {
					args.push(additional); 
				}
			});
		}

		args.push("--");
		// We need the active application file to trigger this
		args.push("src/" + mainApplicationPath);
		if (nova.inDevMode()) {
			console.log(" *** COMMAND [[" + command + "]] ARG: \n");
			consoleLogObject(args);
		}

		if(packageAfterBuild) {
			console.log(" #### Okay, ready to do Promise!");
			return getProcessResults(command, args, nova.workspace.path);
		} else {
			return new TaskProcessAction(command, { args: args });
		}
	}

	/**
	 * @TODO
	 * Run the project with debugger (Not implemented yet, so it's just running as usual!)
	 * @param {string} flexSDKBase - The location of the Flex SDK
	 * @param {string} profile -
	 * @param {string} destDir - The location of where the saved build is
	 * @param {string} appXMLName - The name of the app.xml file
	 */
	debugRun(flexSDKBase, profile, destDir, appXMLName) {
		/*
		var base = nova.path.join(nova.extension.path, "debugger");

		var args = new Array;

		args.push("--server");
		args.push("-Dflexlib=" + flexSDKBase);
		if(isWorkspace()) {
			args.push("-Dworkspace=" + nova.workspace.path);
		}
		//uncomment to debug the SWF debugger JAR
		args.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005");
		args.push("-cp");
		args.push("" + base + "/bundled-debugger/*:" + base + "/bin/*");
		args.push("com.as3mxml.vscode.SWFDebug");

		// @NOTE From Icarus extension
		var action = new TaskDebugAdapterAction("actionscript");
		action.command = "/usr/bin/java";
		action.args = args;
		action.transport = "socket";
		action.port="4711";
		action.adapterStart = "launch";

		console.log("DEBUG!");
		consoleLogObject(args);
		// Haven't figured how to hook up debugger...
		*/

		return this.run(flexSDKBase, profile, destDir, appXMLName);
	}

	/**
	 * Runs the project using Nova's task system
	 * @param {string} flexSDKBase - The location of the Flex SDK
	 * @param {string} profile -
	 * @param {string} destDir - The location of where the saved build is
	 * @param {string} appXMLName - The name of the app.xml file
	 */
	run(flexSDKBase, profile, destDir, appXMLName) {
		// @NOTE See https://help.adobe.com/en_US/air/build/WSfffb011ac560372f-6fa6d7e0128cca93d31-8000.html
		// To launch ADL, we need to point it to the "-app.xml" file
		var command = flexSDKBase + "/bin/adl";
		var args = [];

		console.log("CONFIG: " + profile);
		if(profile!="default") {
			args.push("-profile");
			args.push(profile);
		}

		// The app.xml file
		args.push(destDir + "/" + appXMLName);

		// Root directory goes next
		// "--" then args go now...

		if (nova.inDevMode()) {
			console.log(" *** Attempting to Run ADL with [[" + command + "]] ARG: \n");
			consoleLogObject(args);
		}

		return new TaskProcessAction(command, {
			shell: true,
			args: args,
			env: {}
		});
	}

	/**
	 * Copies all files from the "src" directory to the "dest" directory, avoiding the `ignoreCopy` assets
	 * @param {string} src - The source directory to copy
	 * @param {string} dest - The location to copy the files to
	 */
	copyAssetsOf(src, dest, packageAfterBuild = false) {
		nova.fs.listdir(src).forEach(filename => {
			let currPath = src + '/' + filename;
			///if(this.ignoreCopy.includes(filename)==false) {
			if(shouldIgnoreFileName(filename)==false) {
				if (nova.fs.stat(currPath).isFile()) {
					try{
						// We have to remove it before coping, or @TODO chack if we should replace or skip copying
						if(nova.fs.access(dest+"/"+filename,nova.fs.constants.F_OK)) {
							nova.fs.remove(dest+"/"+filename);
						}
						nova.fs.copy(currPath,dest+"/"+filename);
					} catch(error) {
						console.log(" *** ERROR copyAssetsOf(): ",error);
					}
				} else if (nova.fs.stat(currPath).isDirectory()) {
					nova.fs.mkdir(dest + "/" + filename);
					// Let's also copy this directory too...
					this.copyAssetsOf(currPath, dest + "/" + filename);
				}
			}
		});
	}

	/**
	 * Opens a file and dumps it into a string.
	 * @param {string} filename - The name of the file to open, relative to the workspace
	 * @param {boolean} trimAll - Default: true. Trims each line, and removes extra spacing (useful for pjxml and our XML files!)
	 */
	getStringOfWorkspaceFile(filename, trimAll = true) {
		var line, contents;
		try {
			contents = "";
			//console.log("Trying to open: " + nova.path.join(nova.workspace.path, filename));
			var file = nova.fs.open(nova.path.join(nova.workspace.path, filename));
			if(file) {
				do {
					line = file.readline();
					if(line!=null) {
						if(trimAll) {
							line = line.trim();
						}
						contents += line;
					}
				} while(line && line.length>0);
			}

			if(trimAll) {
				contents = contents.replace((/  |\r\n|\n|\r/gm),"");  // contents.replace(/(\r\n|\n|\r)/gm,"")
			}
		} catch(error) {
			console.log("*** ERROR: Could not open file " + nova.path.join(nova.workspace.path, filename) + " for reading. ***");
			return null;
		}
		return contents;
	}

	/**
	 * Imports setting from a Flash Builder project files and adjust the workspace's settings
	 */
	importFlashBuilderSettings() {
		// Check ".project" XML file for things
		var projectXml = pjXML.parse(this.getStringOfWorkspaceFile(".project"));

		// Change project name to the Flash Builder project name:
		nova.workspace.config.set("workspace.name",String(projectXml.select("//name")[0]["content"]).trim());

		// Check if there is a ".flexProperties"
		// @NOTE Not sure what else we would need from this file
		var isFlex = false;
		var flexProperties = this.getStringOfWorkspaceFile(".flexProperties");
		if(flexProperties!=null) {
			var flexPropertiesXml = pjXML.parse(flexProperties);
			//console.log("compilerSourcePath> " + flexPropertiesXml.select("//flexProperties"));
			//consoleLogObject(flexPropertiesXml.select("//flexProperties"));
			nova.workspace.config.set("editor.default_syntax","MXML");
			nova.workspace.config.set("as3.application.isFlex",true);
			isFlex = true;
		} else {
			nova.workspace.config.set("editor.default_syntax","ActionScript 3");
			nova.workspace.config.set("as3.application.isFlex",false);
		}

		// Check ".actionScriptProperties"
		var actionscriptPropertiesXml = pjXML.parse(this.getStringOfWorkspaceFile(".actionScriptProperties").replace("\\n","").replace("\\r",""));

		var mainApplicationPath = getTagAttribute(actionscriptPropertiesXml,"actionScriptProperties","mainApplicationPath");
		nova.workspace.config.set("as3.application.mainApp",mainApplicationPath);

		var projectUUID = getTagAttribute(actionscriptPropertiesXml,"actionScriptProperties","projectUUID");
		nova.workspace.config.set("as3.application.projectUUID",projectUUID);
/*
		var swfName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));
		console.log("Name of SWF: [" + swfName  + "]");
*/
		nova.workspace.config.set("as3.build.source.main",getTagAttribute(actionscriptPropertiesXml,"compiler","sourceFolderPath"));

		var prefSourceDirs = [];
		actionscriptPropertiesXml.select("//compilerSourcePathEntry").forEach((sourceDir) => {
			console.log(" Add a 'Source Dirs:' entry of [" + getAttribute(sourceDir,"path") + "]");
			prefSourceDirs.push(getAttribute(sourceDir,"path"));
		});
		nova.workspace.config.set("as3.build.source.additional",prefSourceDirs);

		nova.workspace.config.set("as3.build.output",getTagAttribute(actionscriptPropertiesXml,"compiler","outputFolderPath"));

		// Since the XML may have libraryPathEntries in multiple places, we need to take a look at the top children of it.
		//Since pjxml seems to add "" contents after the fact, let's check each one
		var prefLibDirs = [];
		actionscriptPropertiesXml.select("//libraryPath").content.forEach((libDir) => {
			if(libDir!="") {
				if(libDir["attributes"]["kind"]==1) {
					console.log("Add a 'Libs Dirs:` entry of [" + getAttribute(libDir,"path") + "]");
					prefLibDirs.push(getAttribute(libDir,"path"));
				} else {
					// @TODO Kind 4 may be excludes, need to look into how to add that to the call to build...
				}
			}
		});

		nova.workspace.config.set("as3.build.library.additional",prefLibDirs);

		nova.workspace.config.set("as3.build.verifyRSL",(getTagAttribute(actionscriptPropertiesXml,"compiler","verifyDigests")=="true" ? true : false));

		nova.workspace.config.set("as3.build.removeRSL",(getTagAttribute(actionscriptPropertiesXml,"compiler","removeUnusedRSL")=="true" ? true : false));

		nova.workspace.config.set("as3.build.localDebugRuntime",(getTagAttribute(actionscriptPropertiesXml,"compiler","useDebugRSLSwfs")=="true" ? true : false));

		nova.workspace.config.set("as3.build.autoOrder",(getTagAttribute(actionscriptPropertiesXml,"compiler","autoRSLOrdering")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.copy",(getTagAttribute(actionscriptPropertiesXml,"compiler","copyDependentFiles")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.generateAccessable",(getTagAttribute(actionscriptPropertiesXml,"compiler","generateAccessible")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.strict",(getTagAttribute(actionscriptPropertiesXml,"compiler","strict")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.enableWarnings",(getTagAttribute(actionscriptPropertiesXml,"compiler","warn")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.additional",getTagAttribute(actionscriptPropertiesXml,"compiler","additionalCompilerArguments"));

		// Packaging
		nova.workspace.config.set("as3.packaging.certificate",getTagAttribute(actionscriptPropertiesXml,"airSettings","airCertificatePath"));

		nova.workspace.config.set("as3.packaging.timestamp",getTagAttribute(actionscriptPropertiesXml,"airSettings","airTimestamp"));

		var excludedInPackage = []
		actionscriptPropertiesXml.select("//airExcludes").content.forEach((excludes) => {
			if(excludes!="") {
				console.log("Add an exclude to packaging with entry of [" + getAttribute(excludes,"path") + "]");
				excludedInPackage.push(getAttribute(excludes,"path"));
			}
		});
		nova.workspace.config.set("as3.packaging.excludedFiles",excludedInPackage);
	}

	/**
	 * Handles the Clean/Build/Run stuff.
	 * @param {class} context - What's coming from the build options
	 */
	resolveTaskAction(context) {
		var data = context.data;
		var config = context.config;
		var action = context.action;

		// Get the context.config so we can get the Task settings!
		var whatKind = config.get("actionscript3.request");

		var destDir = nova.workspace.config.get("as3.build.output");
		if(destDir==null) {
			destDir = nova.path.join(nova.workspace.path, "bin-debug");
		} else {
			destDir = nova.path.join(nova.workspace.path, destDir);
		}

		var mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
		var isFlex = nova.workspace.config.get("as3.application.isFlex");
		var appXMLName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));

		// Use this to get setting from the extension or the workspace!
		var flexSDKBase = determineFlexSDKBase();

		if(action==Task.Build && data.type=="actionscript") {
			var mainSrcDir = nova.path.join(nova.workspace.path, nova.workspace.config.get("as3.build.source.main"));

			var exportName = (isFlex ? mainApplicationPath.replace(".mxml",".swf") : mainApplicationPath.replace(".as",".swf"));

			var copyAssets = nova.workspace.config.get("as3.compiler.copy");

			var sourceDirs = nova.workspace.config.get("as3.build.source.additional");

			var libPaths = nova.workspace.config.get("as3.build.library.additional");

			return this.build(copyAssets, mainSrcDir, mainApplicationPath, sourceDirs, libPaths, appXMLName, flexSDKBase, whatKind, destDir, exportName);
		} else if(action==Task.Run && data.type=="actionscript") {
			// @TODO Check if the output files are there, otherwise prompt to build
			var profile = config.get("as3.task.profile");
			if(whatKind=="debug") {
				return this.debugRun(flexSDKBase, profile, destDir, appXMLName);
			} else {
				return this.run(flexSDKBase, profile, destDir, appXMLName );
			}
		} else if(action==Task.Clean /* && data.type=="actionscript"*/) {
			return new TaskCommandAction("actionscript.clean", { args: [destDir] });
		}
	}
}
