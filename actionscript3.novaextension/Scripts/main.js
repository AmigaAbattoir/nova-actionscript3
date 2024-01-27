// For help parsing FlashBuilder settings files
var pjXML = require('pjxml');

var langserver = null;
var taskprovider = null;

function getTag(xml, tag) { return String(xml.select("//"+tag)).trim(); }

function getTagAttribute(xml, tag, attr) { return String(xml.select("//"+tag)["attributes"][attr]).trim(); }

function getAttribute(xml, attr) { return String(xml["attributes"][attr]).trim(); }

// Show a notification with the given title and body when in dev mode.
function showNotification(title, body) {
    //if (nova.inDevMode()) {
        let request = new NotificationRequest("as3mxml-nova-message");

        request.title = nova.localize(title);
        request.body = nova.localize(body);
        nova.notifications.add(request);
    //}
}

exports.activate = function() {
    langserver = new AS3MXMLLanguageServer();
    taskprovider = new AS3MXMLTasksAssistant();
    nova.assistants.registerTaskAssistant(taskprovider, {
        identifier: "actionscript",
    });

    //                                          [ Nova stuff...                     ][ Our params to pass]
	nova.commands.register("actionscipt.clean",(workspace, workspacePath, sourcePath, outputPath) => {
        //                 [ Nova stuff...          ][ Our params...]
		taskprovider.clean(workspacePath, sourcePath, outputPath);
	});

	nova.commands.register("actionscipt.checkFBProject",() => {
		taskprovider.importFlashBuilderSettings();
	});

	nova.commands.register("actionscipt.as3reference",() => { nova.openURL("https://help.adobe.com/en_US/FlashPlatform/reference/actionscript/3/index.html"); });
/*
    if (nova.inDevMode()) {
        console.log(">>>> AS3MXML Activated");
        console.log("  >> langserver.languageClient:  " + langserver.languageClient);
        console.log("  >> JSON.stringify(langserver): " + JSON.stringify(langserver));
    }
*/
}

exports.deactivate = function() {
    // Clean up state before the extension is deactivated
    if (nova.inDevMode()) { console.log("<<<< AS3MXML Deactivated"); }

    if (langserver) {
        langserver.deactivate();
        langserver = null;
    }
    taskprovider = null;
}

/**
 * Tell if the current file is being used in a workspace setting or as a independent editor window
 *
 * @see https://github.com/jasonplatts/nova-todo/blob/main/Scripts/functions.js
 * @returns {boolean}  - representing whether or not the current environment is a workspace or
 * Nova window without a workspace.
 */
function isWorkspace() {
    if (nova.workspace.path == undefined || nova.workspace.path == null) {
        // Opening single file in a Nova editor does not define a workspace. A project must exist.
        // Opening a remote server environment is also not considered a workspace.
        return false
    } else {
        // A local project is the only environment considered a Nova workspace.
        return true
    }
}

/* ---- Config Functions ---- */
function getConfig(configName) {
    return nova.config.get(configName);
}

function getWorkspaceOrGlobalConfig(configName) {
    var config = nova.config.get(configName);
    console.log("*** getWorkspaceOrGlobalConfig() Config " + configName + " is [" + config + "]");
    if(isWorkspace()) {
        workspaceConfig = nova.workspace.config.get(configName)
    console.log("*** getWorkspaceOrGlobalConfig() Workspace Config " + configName + " is [" + workspaceConfig + "]");
        if(workspaceConfig) {
            config = workspaceConfig;
        }
    }
    console.log("*** getWorkspaceOrGlobalConfig() RETURNING [" + config + "]");
    return config;
}

function setIfConfigIsSet(configName) {
    var check = getWorkspaceOrGlobalConfig(configName);
    if(check!=null) {
        return configName + ":" + check;
    }
    return null;
}

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


class AS3MXMLTasksAssistant {
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
	 * Copies all files from the "src" directory to the "dest" directory, avoiding the `ignoreCopy` assets
	 * @param {string} src - The source directory to copy
	 * @param {string} dest - The location to copy the files to
	 */
	copyAssetsOf(src, dest) {
		nova.fs.listdir(src).forEach(filename => {
			let currPath = src + '/' + filename;
			///if(this.ignoreCopy.includes(filename)==false) {
			if(shouldIgnoreFileName(filename)==false) {
				console.log(" <><><> filename: " + filename + "    shouldIgnoreFileName(currentPath,ignoreCopy): " + shouldIgnoreFileName(filename));
				if (nova.fs.stat(currPath).isFile()) {
					try{
						if(nova.fs.access(dest+"/"+filename,nova.fs.constants.F_OK)) {
							nova.fs.remove(dest+"/"+filename);
						}
						nova.fs.copy(currPath,dest+"/"+filename);
					} catch(error) {
						console.log(" *** ERROR: ",error);
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
     * Checks for Flash Builder files and adjust the workspace's settings
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
	}

	/**
	 */
	parseMxmlcOptions(optionsString) {
  // Split the optionsString into an array of individual options
	  const optionsArray = optionsString.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

	  // Map the options to create an array of process arguments
	  const processArguments = optionsArray.reduce((args, option) => {
		// Check if the option starts with '-' or '--'
		if (option.startsWith('-')) {
		  // If yes, treat it as a separate argument
		  args.push(option);
		} else {
		  // If not, append it to the last argument (as a value)
		  const lastArg = args[args.length - 1];
		  args[args.length - 1] = lastArg ? `${lastArg} ${option}` : option;
		}
		return args;
	  }, []);

	  return processArguments;
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

		var mainSrcDir = nova.path.join(nova.workspace.path, nova.workspace.config.get("as3.build.source.main"));
		var mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
		var isFlex = nova.workspace.config.get("as3.application.isFlex");
		var exportName = (isFlex ? mainApplicationPath.replace(".mxml",".swf") : mainApplicationPath.replace(".as",".swf"));
		var appXMLName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));
		console.log("\n\nexportName:: " + exportName + "]]]] \n\n");

		// Use this to get setting from the extension or the workspace!
		var flexSDKBase = getWorkspaceOrGlobalConfig("as3mxml.sdk.framework");
		if(flexSDKBase==null) {
			flexSDKBase = getWorkspaceOrGlobalConfig("as3mxml.sdk.default");
		}
        if(flexSDKBase.charAt(0)=="~") {
            flexSDKBase = nova.path.expanduser(flexSDKBase);
        }

		console.log("Setting as3mxml.sdk.framework: " + getWorkspaceOrGlobalConfig("as3mxml.sdk.framework"))
		console.log("Setting as3mxml.sdk.default: " + getWorkspaceOrGlobalConfig("as3mxml.sdk.default"))
		console.log("Using flexSDKBase: " + flexSDKBase);

		var copyAssets = nova.workspace.config.get("as3.compiler.copy");
		console.log("copyAssets: " + copyAssets);

        var sourceDirs = nova.workspace.config.get("as3.build.source.additional");

        var libPaths = nova.workspace.config.get("as3.build.library.additional");

		if(action==Task.Build && data.type=="actionscript") {
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
				       this.copyAssetsOf(copyDir, destDir);
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
			console.log("DOE!!");

            // Let's compile this thing!!
			var command = flexSDKBase + "/bin/mxmlc";
			var args = new Array();
			if(whatKind=="debug") {
				args.push("--debug=true");
			}

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
            return new TaskProcessAction(command, { args: args, });
		} else if(action==Task.Run && data.type=="actionscript") {
            // Should check if the files are there, if not build first!

            if(whatKind=="debug") {
				/* // @NOTE Is this how the debugger is launched?!
                var command =  "";
                var args = [
                	//uncomment to debug the SWF debugger JAR
            		//"-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005",

                	"-cp",
                	this.getClassPath(),
                	"com.as3mxml.vscode.SWFDebug",
                ];

				if (session.workspaceFolder) {
					args.unshift("-Dworkspace=" + session.workspaceFolder.uri.fsPath);
				}
				if (paths.sdkPath) {
					//don't pass in an SDK unless we have one set
					args.unshift("-Dflexlib=" + path.resolve(paths.sdkPath, "frameworks"));
				}
				return new vscode.DebugAdapterExecutable(paths.javaPath, args);
				*/
            } else {
            }


			// @NOTE See https://help.adobe.com/en_US/air/build/WSfffb011ac560372f-6fa6d7e0128cca93d31-8000.html
            // To launch ADL, we need to point it to the "-app.xml" file
		    var command = flexSDKBase + "/bin/adl";
		    var args = [];

			var profile = config.get("as3.task.profile");
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
		    }, args);
		} else if(action==Task.Clean /* && data.type=="actionscript"*/) {
            return new TaskCommandAction("actionscipt.clean", { args: [destDir] });
		}
	}
}

class AS3MXMLLanguageServer {
    languageClient = null;

    constructor() {
        // Observe the configuration setting for the server's location, and restart the server on change
        /*
        nova.config.observe('as3mxml.language-server-path', function(path) {
            this.start(path);
        }, this);
        */
        var path = nova.extension.path;
        if (nova.inDevMode()) {
            console.log("--- AS3MXML Constructor -----------------------------------------------------");
            console.log(" *** Constructing AS3MXML Extension with PATH: ",path);
        }
        this.start(nova.extension.path)
    }

    activate() { }

    deactivate() {
        if (nova.inDevMode()) {
            console.log(" *** AS3MXML Deactivated");
        }
        this.stop();
    }

    start(path) {
        if (nova.inDevMode()) {
            console.log("--- AS3MXML Start(path)-----------------------------------------------------");
            console.log(" *** path: " + path);
        }

        if (this.languageClient) {
            if (nova.inDevMode()) {
                console.log("Language client is active, so let's stop it and remove the subscription!");
            }
            this.languageClient.stop();
            nova.subscriptions.remove(this.languageClient);
        }

        var base =  nova.path.join(nova.extension.path, "language-server");

        // Check if user setup the location of the SDK for this project
        var flexSDKBase = getWorkspaceOrGlobalConfig("as3mxml.sdk.framework");
        if(flexSDKBase!=null && flexSDKBase.charAt(0)=="~") {
            flexSDKBase = nova.path.expanduser(flexSDKBase);
        }

        // Since we can't use user's SDK location, try default
        if(flexSDKBase==null || (nova.fs.access(flexSDKBase, nova.fs.F_OK | nova.fs.X_OK)==false)) {
            flexSDKBase = getWorkspaceOrGlobalConfig("as3mxml.sdk.default");
            if(flexSDKBase.charAt(0)=="~") {
                flexSDKBase = nova.path.expanduser(flexSDKBase);
            }
        }

        if (nova.inDevMode()) {
            console.log("     PATH:: [[" + path + "]]");
            console.log("     BASE:: [[" + base + "]]");
            console.log("     FLEX:: [[" + flexSDKBase + "]]");
        }

        // Check if the flexSDKBase is valid, if not, warn user and abort!
        if(flexSDKBase==null || (nova.fs.access(flexSDKBase, nova.fs.F_OK | nova.fs.X_OK)==false)) {
            console.log("flexSDKBase accessable? ",nova.fs.access(flexSDKBase, nova.fs.F_OK | nova.fs.X_OK));
            showNotification("Configure AIR SDK!", "In order to use this extension you will need to have installed a FlexSDK. Please set the location of \"Default AIR SDK\" in the extension preferences!")
        } else {
            // Create the client
            var args = new Array;

            // For Apple...
            args.push("-Dapple.awt.UIElement=true");

            // If different JVMArgs...
            if(getWorkspaceOrGlobalConfig("as3mxml.languageServer.jvmargs")!=null) {
			    var jvmArgs = getWorkspaceOrGlobalConfig("as3mxml.languageServer.jvmargs").split(" ");
			    jvmArgs.forEach((jvmArg) => {
				    args.push(jvmArg);
			    });
            }

            // if JDK 11 or newer is ever required, it's probably a good idea to
            // add the following option:
            args.push("-Xlog:all=warning:stderr");

            /**
             Commands to start server from: https://github.com/BowlerHatLLC/vscode-as3mxml/wiki/How-to-use-the-ActionScript-and-MXML-language-server-with-Sublime-Text
            */
            args.push("-Dfile.encoding=UTF8");
            args.push("-Droyalelib=" + flexSDKBase);
            args.push("-cp");
            args.push("" + base + "/bundled-compiler/*:" + base + "/bin/*");
            args.push("com.as3mxml.vscode.Main");

		    // Print out all the args so I know what's getting passed!
            if(nova.inDevMode()) {
                var argsOut = "";
                args.forEach(a => argsOut += a + "\n")
                console.log(" *** ARGS:: \\/\\/\\/\n\n" + argsOut + "\n *** ARGS:: /\\/\\/\\");
            }

            // Launch the server
            // First, use the default Mac Java path, or if there is a config setting for it:
            var javaPath = "/usr/bin/java";
            if(getWorkspaceOrGlobalConfig("as3mxml.java.path")!=null) {
                javaPath = getWorkspaceOrGlobalConfig("as3mxml.java.path");
            }

            // Prepare server options (Executable in VSCode talk...)
            var serverOptions = {
                path: javaPath,
                args: args,
                type: "stdio",
                cwd: nova.workspace.path
            };

    /*
            // From https://devforum.nova.app/t/lsp-doesnt-work-unless-re-activate-it/1798
            if (nova.inDevMode()) {
                serverOptions = {
                    path: '/bin/bash',
                    args: [
                      '-c',
                      `tee "${nova.extension.path}/logs/nova-client.log" | ${path} | tee "${nova.extension.path}/logs/lang-server.log"`,
                    ],
                };
            }
    */
            // Client options
            var clientOptions = {
                syntaxes: ["actionscript","mxml","as3"],
                debug: true,

                documentSelector: [
                  { scheme: "file", language: "actionscript" },
                  { scheme: "file", language: "mxml" },
                  { scheme: "file", language: "as3" },
                  { scheme: "file", language: "as" },
                ],
                synchronize: {
                  configurationSection: "as3mxml",
                },
    /*
                uriConverters: {
                    code2Protocol: (value: vscode.Uri) => {
                      return normalizeUri(value);
                    },
                    //this is just the default behavior, but we need to define both
                    protocol2Code: (value) => vscode.Uri.parse(value),
                },
    */
            };

            if (nova.inDevMode()) {
                console.log("serverOptions: " + JSON.stringify(serverOptions));
                console.log("clientOptions: " + JSON.stringify(clientOptions));
            }

            var client = new LanguageClient('actionscript', 'ActionScript & MXML Language Server', serverOptions, clientOptions);
            try {
                // Start the client
                if (nova.inDevMode()) {
                    console.log(" *** Starting AS3MXML server at " + new Date().toLocaleString() + "--------------------");
                }

                client.start();

                client.onDidStop((error) => { console.log("**** AS3MXML ERROR: " + error + ". It may be still running: ", client.running); });
    /*
                nova.assistants.registerCompletionAssistant("as3", new CompletionProvider(), {
                    triggerChars: new Charset(".")
                });
    */
                client.onRequest("as3mxml/logCompilerShellOutput", (params) => {
                  console.log(" *** AS3MXL *** ",params);
                });

			    nova.config.onDidChange("as3mxml.languageServer.jvmargs", (editor) => {
                    if (nova.inDevMode()) {
				        console.log("Configuration changed... Restart LSP with new JVMArgs");
                    }
				    showNotification("Config Change", "JVM Args changed. Restarting Server!");
				    nova.commands.invoke("as3mxml.restart");
			    });

			    nova.config.onDidChange("as3mxml.sdk.framework", (editor) => {
                    if (nova.inDevMode()) {
				        console.log("Configuration changed... Different SDK for project");
                    }
				    showNotification("Config Change", "SDK Changed. Restarting Server!");
				    nova.commands.invoke("as3mxml.restart");
			    });

                nova.subscriptions.add(client);
                this.languageClient = client;

                client.onNotification("as3mxml/logCompilerShellOutput", (params) => {
                    /*
                    var issue = new Issue();
                    issue.message = params;
                    issue.severity = IssueSeverity.Error;
                    */
                    // @TODO Push issue to something...
                    console.log(params);
                });
            }
            catch (err) {
                if (nova.inDevMode()) {
                    console.error(" *** CAUGHT AN ERROR!!!" + err + " .... " + JSON.stringify(err) + " ***");
                }
            }
        }
    }

    stop() {
        if (nova.inDevMode()) {
            console.log("AS3MXML stop() called!");
        }

        if (this.languageClient) {
            if (nova.inDevMode()) {
                console.log(" *** Attempting to stop this.languageClient! ");
            }
            this.languageClient.stop();
            if (nova.inDevMode()) {
                console.log(" *** Attempting to remove subscriptions of this.languageClient! ");
            }
            nova.subscriptions.remove(this.languageClient);
            if (nova.inDevMode()) {
                console.log(" *** Attempting to NULL this.languageClient! ");
            }
            this.languageClient = null;
        } else {
            if (nova.inDevMode()) {
                console.log(" *** this.languageClient is nothing...");
            }
        }
    }
}

nova.commands.register("as3mxml.restart", (editor) => {
    langserver.stop();
    langserver = new AS3MXMLLanguageServer();
});

function saveAllFiles() {
    nova.workspace.textEditors.forEach((editor)=> {
        editor.save();
    });
}

function consoleLogObject(object) {
	console.log(JSON.stringify(object,null,4));
}

function rangeToLspRange(document, range) {
	const fullContents = document.getTextInRange(new Range(0, document.length));

	let chars = 0;
	let startLspRange;

	const lines = fullContents.split(document.eol);

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const lineLength = lines[lineIndex].length + document.eol.length;
		if (!startLspRange && chars + lineLength >= range.start) {
			const character = range.start - chars;
			startLspRange = { line: lineIndex, character };
		}
		if (startLspRange && chars + lineLength >= range.end) {
			const character = range.end - chars;
			return {
				start: startLspRange,
				end: { line: lineIndex, character },
			};
		}
		chars += lineLength;
	}
	return null;
};

nova.commands.register("as3mxml.hovertest", (editor) => {
    if (nova.inDevMode()) { console.log("Called... as3mxml.hovertest"); }

	if(langserver) {
        var position = rangeToLspRange(nova.workspace.activeTextEditor.document, nova.workspace.activeTextEditor.selectedRange);

        if (nova.inDevMode()) {
            console.log("Selectd Range:");
            console.log(nova.workspace.activeTextEditor.selectedRange);
            consoleLogObject( nova.workspace.activeTextEditor.selectedRange);
            console.log("POSITION:");
            consoleLogObject(position);
        }

        langserver.languageClient.sendRequest("textDocument/hover", {
			textDocument: { uri: nova.workspace.activeTextEditor.document.uri },
            position: position.start
        }).then((result) => {
            if(result!==true) {
                showNotification("Hover Test", result.contents.value);
            }
        }, (error) => {
            showNotification("Hover Test ERROR!", error);
			consoleLogObject(error);
        });
    }
});

nova.commands.register("as3mxml.documentsymbols", (editor) => {
    if (nova.inDevMode()) { console.log("Called... as3mxml.documentsymbols"); }

	if(langserver) {
        langserver.languageClient.sendRequest("textDocument/documentSymbol", {
			textDocument: { uri: nova.workspace.activeTextEditor.document.uri },
        }).then((result) => {
            if(result!==true) {
                showNotification("Document Symbols", result.contents.value);
            }
        }, (error) => {
            showNotification("Document Symbols ERROR!", error);
			consoleLogObject(error);
        });
    }
});

nova.commands.register("as3mxml.codeaction", (editor) => {
    if (nova.inDevMode()) { console.log("Called... as3mxml.codeaction"); }

	if(langserver) {
        var position = rangeToLspRange(nova.workspace.activeTextEditor.document, nova.workspace.activeTextEditor.selectedRange);
        console.log("Selectd Range:");
        console.log(nova.workspace.activeTextEditor.selectedRange);
        consoleLogObject( nova.workspace.activeTextEditor.selectedRange);
        console.log("POSITION:");
        consoleLogObject(position);

        langserver.languageClient.sendRequest("textDocument/codeAction", {
			textDocument: { uri: nova.workspace.activeTextEditor.document.uri },
            position: position.start
        }).then((result) => {
            if(result!==true) {
                showNotification("Hover Test", result.contents.value);
            }
        }, (error) => {
            showNotification("Hover Test ERROR!", error);
			consoleLogObject(error);
        });
    }
});

/*
nova.commands.register("as3mxml.addImport", (editor) => {
    console.log("Called... as3mxml.addImport");
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.addImport",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log(result);
        }, (error) => {
            // handle it
            console.error(error);
        });
    }
});

nova.commands.register("as3mxml.removeUnusedImportsInUri", (editor) => {
    console.log("Called... as3mxml.removeUnusedImportsInUri");
    //var filePath = editor.document.path;
    var filePath = nova.workspace.path + "/asconfig.json"
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.removeUnusedImportsInUri",
            arguments: [ "file://" + filePath.replace(" ","%20")]
        }).then((result) => {
            // handle it
            console.log(result);
        }, (error) => {
            // handle it
            console.error(error);
        });
    }
});

nova.commands.register("as3mxml.addMXMLNamespace", (editor) => {
    console.log("Called... as3mxml.addMXMLNamespace");
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.addMXMLNamespace",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log(result);
        }, (error) => {
            // handle it
            console.error(error);
        });
    }
});

nova.commands.register("as3mxml.organizeImportsInUri", (editor) => {
    console.log("Called... as3mxml.organizeImportsInUri");
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.organizeImportsInUri",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log(result);
        }, (error) => {
            // handle it
            console.error(error);
        });
    }
});

nova.commands.register("as3mxml.organizeImportsInDirectory", (editor) => {
    console.log("Called... as3mxml.organizeImportsInDirectory");
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.organizeImportsInDirectory",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log(result);
        }, (error) => {
            // handle it
            console.error(error);
        });
    }
});

nova.commands.register("as3mxml.getActiveProjectURIs", (editor) => {
    var results = {};

    console.log("Called... as3mxml.getActiveProjectURIs");
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.getActiveProjectURIs",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log( " GAPU Result: ",result);
            return result;
        }, (error) => {
            // handle it
            console.error(" GAPU Error: ",error);
        });
    }

    return results;
});

function getActiveProjectURIs() {
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.getActiveProjectURIs",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log( " getActiveProjectURIs() Result: ",result);
            return result;
        }, (error) => {
            // handle it
           // console.error(" GAPU Error: ",error);
        });
    }

    return {};
}
*/