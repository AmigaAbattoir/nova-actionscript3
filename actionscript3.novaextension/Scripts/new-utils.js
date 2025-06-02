const { ActionScript3TaskAssistant } = require("./task-assistant.js");
const { showNotification, consoleLogObject,  getStringOfFile, getProcessResults, ensureFolderIsAvailable, getStringOfWorkspaceFile, quickChoicePalette ,collectInput } = require("./nova-utils.js");
const { determineFlexSDKBase } = require("./config-utils.js");
const { determineProjectUUID } = require("./as3-utils.js");

const NP_TYPE_Flex = "Flex";
const NP_TYPE_FlexLibray = "Flex Library";
const NP_TYPE_FlexMobile = "Flex Mobile";
const NP_TYPE_ActionScript = "ActionScript";
const NP_TYPE_ActionScriptMobile = "ActionScript Mobile";

const NP_APPTYPE_Flash = "Flash";
const NP_APPTYPE_AIR = "AIR";
const NP_APPTYPE_Generic = "Generic";
const NP_APPTYPE_Mobile = "Mobile";
const NP_APPTYPE_Tabbed = "Tabbed";
const NP_APPTYPE_View = "View";
const NP_APPTYPE_Blank = "Blank";

function modifyProjectConfig(projectConfig, className, projectType, applicationType) {
	switch(projectType) {
		case NP_TYPE_Flex:
		case NP_TYPE_FlexMobile: {
			projectConfig["as3.application.isFlex"] = true;
			projectConfig["editor.default_syntax"] = "mxml";

			// Settings for default Flex Project
			projectConfig["as3.application.mainApp"] = className + ".mxml";
			projectConfig["as3.build.autoOrder"] = true;
			projectConfig["as3.build.library.additional"] = [ "libs" ];
			projectConfig["as3.build.localDebugRuntime"] = true;
			projectConfig["as3.build.output"] = "bin-debug";
			projectConfig["as3.build.removeRSL"] = true;
			projectConfig["as3.build.source.additional"] = [ ];
			projectConfig["as3.build.source.main"] = "src";
			projectConfig["as3.build.verifyRSL"] = true;
			projectConfig["as3.compiler.additional"] = "-locale en_US";
			projectConfig["as3.compiler.copy"] = true;
			projectConfig["as3.compiler.enableWarnings"] = true;
			projectConfig["as3.compiler.generateAccessable"] = true;
			projectConfig["as3.compiler.strict"] = true;
			break;
		}
		case NP_TYPE_ActionScript:
		case NP_TYPE_ActionScriptMobile: {
			projectConfig["as3.application.isFlex"] = false;
			projectConfig["editor.default_syntax"] = "actionscript";

			// Settings for default Flex Project
			projectConfig["as3.application.mainApp"] = className + ".as";
			projectConfig["as3.build.autoOrder"] = true;
			projectConfig["as3.build.library.additional"] = [ ];
			projectConfig["as3.build.localDebugRuntime"] = true;
			projectConfig["as3.build.output"] = "bin-debug";
			projectConfig["as3.build.removeRSL"] = true;
			projectConfig["as3.build.source.additional"] = [ ];
			projectConfig["as3.build.source.main"] = "src";
			projectConfig["as3.build.verifyRSL"] = true;
			projectConfig["as3.compiler.additional"] = "-locale en_US";
			projectConfig["as3.compiler.copy"] = true;
			projectConfig["as3.compiler.enableWarnings"] = true;
			projectConfig["as3.compiler.generateAccessable"] = true;
			projectConfig["as3.compiler.strict"] = true;
			break;
		}
		case NP_TYPE_FlexLibray: {
			projectConfig["as3.application.isFlex"] = true;
			projectConfig["editor.default_syntax"] = "actionscript";

			/* @TODO Address this... the excludes library are different.
			Generic .actionscriptProperties
				<excludedEntries>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/flex.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/core.swc" useDefaultLinkType="false"/>
				</excludedEntries>

			Mobile .actionscriptProperties
				<excludedEntries>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/advancedgrids.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/qtp.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/automation_air.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/air/airspark.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/netmon.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/mx/mx.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/air/applicationupdater.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/utilities.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/flex.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/sparkskins.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/qtp_air.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/datavisualization.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/spark_dmv.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/automation.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/automation_dmv.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/automation_flashflexkit.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/air/applicationupdater_ui.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/air/airframework.swc" useDefaultLinkType="false"/>
					<libraryPathEntry kind="3" linkType="1" path="${PROJECT_FRAMEWORKS}/libs/automation_agent.swc" useDefaultLinkType="false"/>
				</excludedEntries>
			*/
			projectConfig["as3.application.mainApp"] = className + ".as";
			projectConfig["as3.build.autoOrder"] = true;
			projectConfig["as3.build.library.additional"] = [ ];
			projectConfig["as3.build.localDebugRuntime"] = true;
			projectConfig["as3.build.output"] = "bin";
			projectConfig["as3.build.removeRSL"] = true;
			projectConfig["as3.build.source.additional"] = [ ];
			projectConfig["as3.build.source.main"] = "src";
			projectConfig["as3.build.verifyRSL"] = true;
			projectConfig["as3.compiler.additional"] = "-locale en_US";
			projectConfig["as3.compiler.copy"] = false;
			projectConfig["as3.compiler.enableWarnings"] = true;
			projectConfig["as3.compiler.generateAccessable"] = false;
			projectConfig["as3.compiler.strict"] = true;
			break;
		}
	}

	return projectConfig;
}

function modifyTaskJson(taskJson, projectType, applicationType) {
	switch(projectType) {
		case NP_TYPE_FlexLibray: {
			taskJson["extensionTemplate"] = "actionscript-lib";
			taskJson["extensionValues"]["as3.lib.includeAllClasses"] = true;
			taskJson["extensionValues"]["as3.lib.classEntries"] = [ ];
			taskJson["extensionValues"]["as3.lib.resource.dest"] = [ ];
			taskJson["extensionValues"]["as3.lib.resource.source"] = [ ] ;
			taskJson["extensionValues"]["as3.lib.nsm.manifest"] = [ ];
			taskJson["extensionValues"]["as3.lib.nsm.namespace"] = [ ];
			break;
		}
		default: {
			if(applicationType==NP_APPTYPE_Flash) {
				taskJson["extensionTemplate"] = "actionscript-flash";
			} else {
				taskJson["extensionTemplate"] = "actionscript-air";
			}
		}
	}

	// Enable Build on Run if enabled
	if(nova.config.get("as3.project.buildOnRun")) {
		taskJson["buildBeforeRunning"] = true;
	}

	// Enable Open report window when run
	if(nova.config.get("as3.project.openOnRun")) {
		taskJson["openLogOnRun"] = "start";
	}

	return taskJson;
}

/**
 * Makes a new Flex/ActionScript Project for Nova.
 *
 * @param {string} projectType - The project type. By default it's empty, and will prompt for which
 * type with a chooser.
 * @param {string} applicationType - The application type, usually Flash or AIR, or for mobile,
 * which view systems to use. By default, it's empty. Based upon the project type, we may need to
 * ask what application type.
 */
exports.makeNewProject = function(projectType = "", applicationType = "") {
	// Figure out the new Project's type. If passed, we don't need to ask...
	var projectTypePromise;
	if(projectType!="") {
		projectTypePromise = Promise.resolve(projectType);
	} else {
		projectTypePromise = quickChoicePalette([
			NP_TYPE_Flex,
			NP_TYPE_FlexLibray,
			NP_TYPE_FlexMobile,
			NP_TYPE_ActionScript,
			NP_TYPE_ActionScriptMobile
		], "What kind of project?").then((choice) => choice.value);
	}

	// Now that we have a Project Type, let's see if we need to check what type of Application it will be
	projectTypePromise.then((projectType) => {
		// console.log(" PROJECT TYPE: ][" + projectType + "]]");
		if(projectType==undefined) { // If it's undefined, the user aborted the selector, bail out!
			return;
		}

		var applicationTypePromise;
		if(applicationType!="") {
			applicationTypePromise = Promise.resolve(applicationType);
		} else if (projectType==NP_TYPE_ActionScriptMobile) {
			applicationTypePromise = Promise.resolve(NP_APPTYPE_AIR);
		} else {
			let buttons = [];
			let extraContext = "";
			switch(projectType) {
				case NP_TYPE_Flex:
				case NP_TYPE_ActionScript: {
					buttons = [ NP_APPTYPE_AIR, NP_APPTYPE_Flash ];
					break;
				}
				case NP_TYPE_FlexLibray: {
					extraContext = "\n\nGeneric can be used with web, desktop, and mobile projects\nMobile can only be used with mobile projects."
					buttons = [ NP_APPTYPE_Generic, NP_APPTYPE_Mobile ];
					break;
				}
				case NP_TYPE_FlexMobile: {
					extraContext = "\n\nSelect which way the mobile project will present itself."
					buttons = [ NP_APPTYPE_Blank, NP_APPTYPE_View, NP_APPTYPE_Tabbed ];
					break;
				}
			}

			// Ask which application type to use
			applicationTypePromise = new Promise((resolve) => {
				nova.workspace.showActionPanel("What application type for this " + projectType + " project?" + extraContext,
					{ buttons: buttons }, (result) => { resolve(buttons[result]); }
				);
			});
		}

		applicationTypePromise.then((applicationType) => {
			if(applicationType==undefined) { // If application type is undefined, then somehow they cancelled which type. Abort.
				return;
			}

			return new Promise((resolve) => {
				// Ask for the location on where to save the new project's folder:
				nova.workspace.showFileChooser(
					"Select where to create a new project, the next step will ask for it's name and create the folder.",
					{ prompt: "Save in here...", allowFiles: true, allowFolders: true, allowMultiple: false },
					(location) =>
				{
					if(location) {
						// Ask a few questions about the project to create
						const prefix = "Create new " + projectType + " Project" + (applicationType!="" ? "(" + applicationType + ")" : "") + "\n\n";
						const prompts = [
							{ message: prefix + "Enter the folder name for the new project.", placeholder: "Required", isRequired: true },
							{ message: prefix + "Enter the name of the project. \n\nNote: It can be different from the folder's name. If it only contains letters, numbers, underscores, dollar symbols and double-byte characters this will be used for the name of the main class.", placeholder: "Required", isRequired: true },
						];

						collectInput(prompts).then((responses) => {
							if(responses!==null) {
								// Create path with object 0 + object 1
								var projectFolder = location + "/" + responses[0];
								var projectName = responses[1];

								let className = projectName;
								const classNameTestRegex = /^[A-Za-z0-9_\$\u4e00-\u9fff]+$/;
								// Project name is supposed to only contain letters, numbers, underscores, dollar symbols
								// and double-byte characters, otherwise we need to change the name of the main class and files made
								if(classNameTestRegex.test(projectName)==false) {
									className = "Main";
								}

								// Make sure we create the project's folder...
								if(ensureFolderIsAvailable(projectFolder)) {
									// Now let's make sure we create the project settings, We'll add more to it later.
									if(ensureFolderIsAvailable(projectFolder+"/.nova")) {
										let flexSDKBase = determineFlexSDKBase();

										// Setup a basic project configuration
										var projectConfig = {
											"workspace.name": projectName
										};
										projectConfig["as3.project.asconfigMode"] = "automatic";
										projectConfig["as3.application.projectUUID"] = nova.crypto.randomUUID();

										// Setup basic task
										let taskAssist = new ActionScript3TaskAssistant();
										let taskJson = taskAssist.baseTaskJson;

										// Setup basic asconfig file
										let asconfigContent = {
											"config": "air",
											"compilerOptions": {
												"source-path": [
													"src"
												],
												"output": "bin-debug/" + className + ".swf",
												"library-path": [
													"libs"
												]
											},
											"mainClass": className,
										}
										// Need to add the application attribute for AIR
										if(applicationType==NP_APPTYPE_AIR) {
											asconfigContent["application"] = "src/" + className + "-app.xml";
										}
										// Need to change config type for mobile
										if(projectType==NP_TYPE_FlexMobile || projectType==NP_TYPE_ActionScriptMobile) {
											asconfigContent["config"] = "airmobile";
										}

										// Let's make a source folder and start putting in code!
										if(ensureFolderIsAvailable(projectFolder+"/src")) {
											let sourceToCopy;

											// Generate basic files for project if needed
											try {
												if(projectType==NP_TYPE_Flex) {
													nova.fs.copy(nova.path.join(nova.extension.path, "/Template/Projects/Flex/" + applicationType + ".mxml"),projectFolder + "/src/" + className + ".mxml");
												} else if(projectType==NP_TYPE_FlexMobile) {
													nova.fs.copy(nova.path.join(nova.extension.path, "/Template/Projects/" + sourceToCopy + "/Main.mxml"),projectFolder + "/src/" + className + ".mxml");
													switch(applicationType) {
														case NP_APPTYPE_Blank: {
															sourceToCopy = "Mobile Blank";
															break;
														}
														case NP_APPTYPE_Tabbed: {
															sourceToCopy = "Mobile Tabbed";
															if(ensureFolderIsAvailable(projectFolder + "/src/views")) {
																nova.fs.copy(nova.path.join(nova.extension.path, "/Template/Projects/" + sourceToCopy + "/Tabview.mxml"),projectFolder + "/src/views/OneTabView.mxml");
															} else {
																nova.workspace.showErrorMessage("Problem creating views files for new project at " + projectFolder);
															}
															break;
														}
														case NP_APPTYPE_View: {
															sourceToCopy = "Mobile View";
															if(ensureFolderIsAvailable(projectFolder + "/src/views")) {
																nova.fs.copy(nova.path.join(nova.extension.path, "/Template/Projects/" + sourceToCopy + "/View.mxml"),projectFolder + "/src/views/MainHomeView.mxml");
															} else {
																nova.workspace.showErrorMessage("Problem creating views files for new project at " + projectFolder);
															}
															break;
														}
													}
												} else if(projectType==NP_TYPE_ActionScript) {
													// Make a class file
													let mainClassAS = getStringOfFile(nova.path.join(nova.extension.path, "/Template/New Class.as"));
													mainClassAS = mainClassAS.replace(/{{classname}}/g,className);
													let mainClassASFile = nova.fs.open(projectFolder + "/src/" + className + ".as", "w");
													mainClassASFile.write(mainClassAS);
													mainClassASFile.close();
												} else if(projectType==NP_TYPE_ActionScriptMobile) {
													// Make a class file
													let mainClassAS = getStringOfFile(nova.path.join(nova.extension.path, "/Template/New Mobile Class.as"));
													mainClassAS = mainClassAS.replace(/{{classname}}/g,className);
													let mainClassASFile = nova.fs.open(projectFolder + "/src/" + className + ".as", "w");
													mainClassASFile.write(mainClassAS);
													mainClassASFile.close();
												}
											} catch(error) {
												nova.workspace.showErrorMessage("Problem creating basic source files for new project at " + projectFolder);
											}

											// Modify the Project configs
											projectConfig = modifyProjectConfig(projectConfig, className, projectType, applicationType);

											// Modify the Task
											taskJson = modifyTaskJson(taskJson, projectType, applicationType)

											// If it's an AIR project, we need to generate an -app.xml file...
											if(applicationType==NP_APPTYPE_AIR) {
												// From AIRSDK -> template / air /descriptor-template.xml
												let appXML = getStringOfFile(nova.path.join(flexSDKBase, "templates/air/descriptor-template.xml"));
												appXML = appXML.replace("<id></id>","<id>" + className + "</id>")
												appXML = appXML.replace("<filename></filename>","<filename>" + className + "</filename>")
												appXML = appXML.replace("<name></name>","<name>" + className + "</name>")
												appXML = appXML.replace("<versionNumber>1.0.0</versionNumber>","<versionNumber>0.0.0</versionNumber>")
												appXML = appXML.replace("<content></content>","<content>[This value will be overwritten by Nova in the output app.xml]</content>")

												var newAppXMLFile = nova.fs.open(projectFolder + "/src/" + className + "-app.xml", "w");
												newAppXMLFile.write(appXML);
												newAppXMLFile.close();
												//    Load from SDK, and change values...
											}

											// If it's a Flash application type, generate the HTML template folder!
											if(applicationType==NP_APPTYPE_Flash) {
												try {
													nova.fs.copy(flexSDKBase + "/templates/swfobject", projectFolder+"/html-template");
												} catch (error) {
													nova.workspace.showWarningMessage("Problem trying to generate html-template folder for project at " + projectFolder + ". You may need to try editing the project's setting by unchecking then checking the `Generate HTML wrapper file` option to generate it.");
												}
											}

											// Make some placeholder folders, these are different for a library and other types of projects
											try {
												if(projectType==NP_TYPE_FlexLibray) {
													nova.fs.mkdir(nova.path.join(projectFolder, "bin"));
												} else {
													nova.fs.mkdir(nova.path.join(projectFolder, "libs")); // Library folder
													nova.fs.mkdir(nova.path.join(projectFolder, "bin-debug")); // bin-debug
												}
											} catch(error) {
												nova.workspace.showWarningMessage("Problem creating placeholder folders at " + projectFolder);
											}

											// Write the Task file, which if it doesn't make, we're in trouble
											try {
												if(ensureFolderIsAvailable(projectFolder+"/.nova/Tasks/")) {
													let taskName = applicationType;

													switch(projectType) {
														case NP_TYPE_FlexLibray:
															taskName = "AS3 Library";
														case NP_TYPE_Flex:
														case NP_TYPE_ActionScript: {
															var taskFile = nova.fs.open(projectFolder+"/.nova/Tasks/"+taskName+".json","w");
															taskFile.write(JSON.stringify(taskJson,null,2));
															taskFile.close();
															break;
														}
														case NP_TYPE_FlexMobile:
														case NP_TYPE_ActionScriptMobile: {
															// Make AIR (Desktop) (there's no other changes needed yet...)
															var taskFile = nova.fs.open(projectFolder+"/.nova/Tasks/AIR.json","w");
															taskFile.write(JSON.stringify(taskJson,null,2));
															taskFile.close();

															// Make Android
															taskJson["extensionTemplate"] = "actionscript-android";
															taskJson["extensionValues"]["as3.target"] = "android";
															var taskAndroidFile = nova.fs.open(projectFolder+"/.nova/Tasks/AIR - Android.json","w");
															taskAndroidFile.write(JSON.stringify(taskJson,null,2));
															taskAndroidFile.close();

															// Make iOS
															taskJson["extensionTemplate"] = "actionscript-ios";
															taskJson["extensionValues"]["as3.target"] = "ios";
															var taskIOSFile = nova.fs.open(projectFolder+"/.nova/Tasks/AIR - iOS.json","w");
															taskIOSFile.write(JSON.stringify(taskJson,null,2));
															taskIOSFile.close();
															break;
														}
													}
												} else {
													nova.workspace.showErrorMessage("Problem creating Tasks folder for new project at " + projectFolder + "/.nova/Tasks/");
												}
											} catch(error) {
												nova.workspace.showErrorMessage("Problem creating Tasks for new project at " + projectFolder + "/.nova/Tasks/");
											}

											// Write the configurations, which if it doesn't make, we're in trouble
											try {
												var configFile = nova.fs.open(projectFolder + "/.nova/Configuration.json","w");
												configFile.write(JSON.stringify(projectConfig,null,2));
												configFile.close();
												// console.log("Write config....")
											} catch(error) {
												nova.workspace.showErrorMessage("Problem creating the configuration for new project at " + projectFolder + "/.nova");
											}

											// Write asconfig.json, if it doesn't write, then they can try to make the asconfig.json with the command
											try {
												var asconfigFile = nova.fs.open(projectFolder + "/asconfig.json","w");
												asconfigFile.write(JSON.stringify(asconfigContent,null,2));
												asconfigFile.close();
											} catch(error) {
												nova.workspace.showWarningMessage("Problem creating asconfig.json files for new project at " + projectFolder + ". You may want to try using the menu item ActionScript 3 -> Force Update to asconfig.json file.");
											}

											// All that's left now is to open the project in Nova.
											// console.log("V@@@:");
											getProcessResults("/usr/local/bin/nova", [ projectFolder ]).then((result) => {
												resolve(result);
											}).catch((error) => {
												// console.error("@@@@@@   @@  @@  Problem opening project", error);
												consoleLogObject(error)
												reject(error); // Reject the promise with the error
											});
										} else {
											// Error making Source files... Abort!
											nova.workspace.showErrorMessage("Problem creating source files for new project at " + projectFolder);
										}
									} else {
										nova.workspace.showErrorMessage("Problem creating settings folder for new project at " + projectFolder);
									}
								} else {
									nova.workspace.showErrorMessage("Problem creating the folder for the new project at " + projectFolder);
								}
							}
						});
					}
				});
			});
		});
	});
}

exports.makeNewFile = function(fileType = "") {
	return new Promise((resolve) => {
		// For files like CSS which is easy, we just need to ask where and then the filename...
		// But for something like an new interface, we would need to get package name, interface name, if it's public or internal, and any "extended interfaces".
		// The default location will be the project's main source folder, the package name would be the folder in there, and then the interface name would be filename.

		if(fileType=="CSS") {
			// Ask for the location on where to save the new project's folder:
			nova.workspace.showFileChooser(
				"Select where to create the new file:",
				{ prompt: "New file in here...", allowFiles: true, allowFolders: true, allowMultiple: false },
				(location) =>
			{
				if(location) {
					// Ask a few questions about the project to create
					const prefix = "Create new " + fileType + " file" + "\n\n";
					let prompts = [
						{ message: prefix + "Enter the folder name for the new " + fileType + "file that will be located at " + location, placeholder: "Required", isRequired: true },
					];

					collectInput(prompts).then((responses) => {
						if(responses!==null) {
							if(fileType=="CSS") {
								let filename = responses[0];
								if(filename.endsWith(".css")==false) {
									filename += ".css";
								}

								try {
									nova.fs.copy(nova.path.join(nova.extension.path, "/Template/New CSS.css"),location + "/" + filename);
								} catch (error) {
									nova.workspace.showWarningMessage("Problem creating new " + filetype + " file at " + location + "/" + filename);
								}
							}
						}
					});
				}
			});
		} else {
// 			// @TODO Looks like we got our work cut out for us!
// 			// Ask a few questions about the project to create
// 			const prefix = "Create new " + fileType + " file" + "\n\n";
//
// 			// State the Project's folder name + Main source dir as the location...
//
// 			let prompts = [
// 				{ message: prefix + "Enter the package name for the new " + fileType + ". You can leave it blank." + location, placeholder: "", isRequired: false },
// 				{ message: prefix + "Enter the file name for the new " + fileType + "file:", placeholder: "Required", isRequired: true },
// 			];
//
// 			collectInput(prompts).then((responses) => {
// 				if(responses!==null) {
// 					if(fileType=="CSS") {
// 						let filename = responses[0];
// 						if(filename.endsWith(".css")==false) {
// 							filename += ".css";
// 						}
//
// 						try {
// 							nova.fs.copy(nova.path.join(nova.extension.path, "/Template/New CSS.css"),location + "/" + filename);
// 						} catch (error) {
// 							nova.workspace.showWarningMessage("Problem creating new " + filetype + " file at " + location + "/" + filename);
// 						}
// 					}
// 				}
// 			});
		}
	});
}
