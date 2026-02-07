/**
 * nova-utils.js
 *
 * Some commonly used functions I use in Panic Nova extensions
 *
 * @author Christopher Pollati
 * @version 1.0
 * @since 2026-02-07
 */

/* ---- Processes ---- */

/**
 * Runs a process so that we get get the Promise when it's done.
 *
 * @note For tricky situations, uncomment the try to get more detail
 * @param {string} command - The command to use
 * @param {Array} args - An array with the arguments for the command (optional)
 * @param {string} cwd - The working directory (defaults to current, extension's directory)
 * @param {Object} env - Additional envs to set for the process (optional)
 * @returns {Promise} - If the status is 0, then it `resolves` otherwise `rejects`. Both will
 * return back an object containing status, stdout and stderr.
 */
exports.getProcessResults = function(command, args = [], cwd = "", env = {}, debugOutput = false) {
// try{
	debugOutput = true;

	var proc = new Promise((resolve, reject) => {
		var stdout = "";
		var stderr = "";

		var process = new Process(command, { args: args, cwd: cwd, env: env });
		process.onStdout(line => stdout += line);
		process.onStderr(line => stderr += line);
		process.onDidExit(status => {
			if(debugOutput) {
				exports.consoleNoteAndObject("nova-utils.getProcessResults() status: ",status);
				exports.consoleNoteAndObject("nova-utils.getProcessResults() stdout: ",stdout);
				exports.consoleNoteAndObject("nova-utils.getProcessResults() stderr: ",stderr);
				exports.consoleNoteAndObject("nova-utils.getProcessResults() command: ",command);
				exports.consoleNoteAndObject("nova-utils.getProcessResults() args: ",args);
				exports.consoleNoteAndObject("nova-utils.getProcessResults() cwd: ",cwd);
				exports.consoleNoteAndObject("nova-utils.getProcessResults() env: ",env);
			}
			let results = { status: status, stdout: stdout, stderr: stderr };
			if(debugOutput) {
				exports.consoleNoteAndObject("nova-utils.getProcessResults() results: ",results);
			}
			if(status===0) {
				if(debugOutput) {
					console.log("nova-utils.getProcessResults() Going to resolve...");
				}
				resolve(results);
			} else {
				if(debugOutput) {
					console.warn("nova-utils.getProcessResults() Going to reject...");
				}
				reject(results);
			}
		});
		process.start();
	});
// } catch(error) { console.error("getProcessResults() *** ERROR: ***",error); }
	return proc;
}

/**
 * Finds the actual executable file in a Mac App
 *
 * @param {string} appLocation - Location of the Application.app "folder"
 * @returns {string|null} - The location of the first executable in the .app, otherwise null
 */
exports.getExec = function(appLocation) {
	const exePath = nova.path.join(appLocation,"/Contents/MacOS"); // Path to the MacOS folder
	let execFiles
	try {
		execFiles = nova.fs.listdir(exePath); // List all files in the folder
		if (!execFiles) {
			console.error(`nova-utils.getExec() *** ERROR: No files found in ${exePath} ***`);
			return null;
		}
		for (const exec of execFiles) {
			const execCheck = nova.path.join(exePath,exec);
			if (nova.fs.access(execCheck, nova.fs.F_OK | nova.fs.X_OK)) {
				return execCheck; // Return the first executable file found
			}
		}
	} catch(error) {
		return null;
	}
}

/* ---- Workspace ---- */

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
 * Returns a config, first checking for the extension, then if there is a Workspace value.
 *
 * @param {String} configName - The key of the configuration to get
 */
exports.getWorkspaceOrGlobalConfig = function(configName) {
	var config = nova.config.get(configName);
	//console.log("getWorkspaceOrGlobalConfig() Config " + configName + " is [" + config + "]");
	if(exports.isWorkspace()) {
		workspaceConfig = nova.workspace.config.get(configName)
		//console.log("getWorkspaceOrGlobalConfig() Workspace Config " + configName + " is [" + workspaceConfig + "]");
		if(workspaceConfig) {
			config = workspaceConfig;
		}
	}
	//console.log("getWorkspaceOrGlobalConfig() RETURNING [" + config + "]");
	return config;
}

/**
 * Saves all the open text editors!
 */
exports.saveAllFiles = function() {
	nova.workspace.textEditors.forEach((editor)=> {
		editor.save();
	});
}

/* ---- Dev Helper ---- */

/**
 * Helper to log out a note and an object by trying to stringify it.
 *
 * @param {string} note - Some text to include before logging object
 * @param {Object} object - What you want to try to console.log()
 */
exports.consoleNoteAndObject = function(note,object,isError = false) {
	if(isError) {
		console.error(`${note}\n${JSON.stringify(object,null,4)}`);
	} else {
		console.log(`${note}\n${JSON.stringify(object,null,4)}`);
	}
}

/**
 * Helper to log out an object by trying to stringify it.
 *
 * @param {Object} object - What you want to try to console.log()
 */
exports.consoleLogObject = function(object) {
	console.log(JSON.stringify(object,null,4));
}

/* ---- Filesystem ---- */

/**
 * Resolved symbolic links to their real location.
 *
 * @param {string} folder - The location that is a symbolic link
 * @returns {Promise} The resolved path, or a reject error.
 */
exports.resolveSymLink = function(folder) {
	return new Promise((resolve, reject) => {
		try {
			const process = new Process("/usr/bin/readlink", {
				args: [folder]
			});

			let output = "";
			let errorOutput = "";

			process.onStdout(line => {
				output += line.trim();
			});

			process.onStderr(line => {
				errorOutput += line.trim();
			});

			process.onDidExit(status => {
				if (status === 0) {
					// Successfully resolved the symbolic link
					const lastSlashIndex = folder.lastIndexOf('/');
					const basePath = folder.substring(0, lastSlashIndex);
					const resolvedPath = nova.path.normalize(nova.path.join(basePath, output));
					resolve(resolvedPath);
				} else {
					reject(new Error(`Failed to resolve symlink for ${folder}: ${errorOutput}`));
				}
			});

			process.start();
		} catch (error) {
			reject(error);
		}
	});
}

/**
 * Opens a file from the current workspace and dumps it into a string.
 *
 * @param {string} filename - The name of the file to open, relative to the workspace
 */
exports.getStringOfWorkspaceFile = function(filename, logAsError = true) {
	return exports.getStringOfFile(nova.path.join(nova.workspace.path, filename),logAsError);
}

/**
 * Opens a file and dumps it into a string.
 *
 * @param {string} filename - The name of the file to open, must be complete path!
 */
exports.getStringOfFile = function(filename, logAsError = true) {
	var line, contents;
	try {
		contents = "";
		// console.log("Trying to open: " + filename);
		var file = nova.fs.open(filename);
		if(file) {
			do {
				line = file.readline();
				if(line!=null) {
					contents += line;
				}
			} while(line && line.length>0);
		}
	} catch(error) {
		if(logAsError) {
			console.error(`nova-utils.getStringOfFile() *** ERROR: Could not open file ${filename} for reading. " + error + " ***`);
		}
		return null;
	}
	return contents;
}

/**
 * Writes a file of text.
 *
 * @param {string} filename - The name of the file to write, must be complete path!
 * @param {string} contents - A string to write to the file
 */
exports.writeStringToFile = function(filename, contents) {
	try {
		var file = nova.fs.open(filename,"w");
		file.write(contents);
		file.close();
	} catch(error) {
		console.error(`nova-utils.writeStringToFile() *** ERROR: Problem with ${filename} for writing. " + error + " ***`);
		return null;
	}
}

/**
 * Writes a text file of JSON based on the Object that is passed.
 *
 * @param {string} filename - The name of the file to write, must be complete path!
 * @param {Object} values - An object of data (that gets `JSON.stringified`) to save
 */
exports.writeJsonToFile = function(filename, values) {
	try {
		var file = nova.fs.open(filename,"w");
		file.write(JSON.stringify(values,null,2));
		file.close();
	} catch(error) {
		console.error(`nova-utils.writeJsonToFile() *** ERROR: Problem with ${filename} for writing JSON. " + error + " ***`);
		return null;
	}
}

/**
 * Checks if a file exists
 *
 * @param {String} filename - The full path of the file
 */
exports.doesFileExist = function(filename) {
	try {
		if(filename!=null) {
			var stat = nova.fs.stat(filename);
			if(stat) {
				if(stat.isFile()) {
					return true;
				}
			}
		}
	} catch(err) {
		console.error(`nova-utils.doesFileExist() *** ERROR *** ${err}`);
	}
	return false;
}

/**
 * Checks if a folder exists
 *
 * @param {String} filename - The full path of the file
 */
exports.doesFolderExist = function(filename) {
	try {
		if(filename!=null) {
			var stat = nova.fs.stat(filename);
			if(stat) {
				if(stat.isDirectory()) {
					return true;
				}
			}
		}
	} catch(err) {
		console.error(`nova-utils.doesFolderExist() *** ERROR *** ${err}`)
	}
	return false;
}

/**
 * Checks if the user has access to
 *
 * @param {String} filename - The full path of the file
 */
exports.haveAccessTo = function(filename) {
	try {
		if(filename!=null) {
			if(nova.fs.access(filename, nova.fs.F_OK | nova.fs.X_OK)) {
				return true;
			} else {
				return false;
			}
		}
	} catch(err) {
		console.error(`nova-utils.haveAccessTo() *** ERROR *** ${err}`)
	}
	return false;
}

/**
 * Checks if the folder exists and the user has access to it
 *
 * @param {String} filename - The full path of the file
 */
exports.doesFolderExistAndIsAccessible = function(folderName) {
	try {
		if(folderName!=null) {
			var stat = nova.fs.stat(folderName);
			if(stat) {
				if(stat.isDirectory()) {
					if(nova.fs.access(folderName, nova.fs.F_OK | nova.fs.X_OK)) {
						return true;
					} else {
						return false;
					}
				}
			}
		}
	} catch(err) {
		console.error(`nova-utils.doesFolderExistAndIsAccessible() *** ERROR *** ${err}`)
	}
	return false;
}

/**
 * Ensures that we expand any path starting with ~/
 *
 * @param {string} filename - The file/path
 */
exports.ensureExpandedUserPath = function(filename) {
	// console.log(`ensureExpandedUserPath() [[${filename}]]`)
	if(filename!=null) {
		if(filename.charAt(0)=="~") {
			filename = nova.path.expanduser(filename);
		}
	}
	return filename;
}

/**
 * Makes sure that we have a folder so we can put stuff in it
 *
 * @returns {boolean} - True if the folder is there, otherwise false
 */
exports.ensureFolderIsAvailable = function(folder) {
	// console.log("export.ensureFolderIsAvailable  folder is " + folder);
	if(nova.fs.access(folder, nova.fs.F_OK | nova.fs.X_OK)===false) {
		// console.log(" Making folder at " + folder + "!!!");
		nova.fs.mkdir(folder+"/");
	}
	// Double check, do we have the folder?
	if(nova.fs.access(folder, nova.fs.F_OK | nova.fs.X_OK)===false) {
		console.error(`nova-utils.ensureFolderIsAvailable() *** ERROR: Failed to make folder at ${folder}! ***`);
		return false;
	}
	return true;
}

/**
 * Used to ensure a folder is empty, or if it exists, then remove it and then create it
 *
 * @param {string} folder - The name of the folder to empty, must be complete path!
 */
exports.makeOrClearFolder = function(folder) {
	try {
		if(nova.fs.access(folder, nova.fs.F_OK | nova.fs.X_OK)===false) {
			// console.log(" Making folder at " + folder + "!!!");
			nova.fs.mkdir(folder+"/");
		} else if(nova.fs.stat(folder).isDirectory()) {
			// console.log("Trying to remove directory....");
			nova.fs.rmdir(folder);
			nova.fs.mkdir(folder+"/");
		}
		return true;
	} catch(error) {
		nova.workspace.showErrorMessage("Failed to make folder: " + folder + "\n",error);
		// console.error("*** ERROR: Failed to make folder " + folder + " *** ");
	}
	return false;
}

/**
 * Checks if a file was modified after the other (target) file.
 *
 * @param {string} target - Path to the file that you want to see if
 * @param {string} other - Path to the other file
 * @returns {boolean} - `true` if the target file was modified after the other file or if the other
 * file does not exist. `false` if the other file is newer than the target file or the target file
 * does not exist.
 */
exports.checkIfFileWasModifiedAfterOther = function(target, other) {
	var targetStat = nova.fs.stat(target);
	var otherStat = nova.fs.stat(other);

	if(targetStat!=undefined) {
		if(otherStat==undefined || targetStat.mtime.getTime()>otherStat.mtime.getTime()) {
			return true;
		}
	}

	return false;
}

/**
 * Checks to see if this is a file that should be ignored
 *
 * @param {string} fileName - The filename to check with the list of file that need to be excluded
 */
exports.shouldIgnoreFileName = function(fileName, fileNamesToExclude, fileExtensionsToExclude) {
	if(fileNamesToExclude.includes(fileName)) {
		return true;
	}
	if(fileExtensionsToExclude.some(ext => fileName.endsWith(ext))) {
		return true;
	}
	return false;
}

/**
 * Checks if any files in the `folderToCheck` were modified after the `builtFile` was made.
 *
 * @param {string} builtFile - The path to a file to check against
 * @param {string[]} foldersToCheck - Full path to folders to check if they were modified after the
 * `builtFile`
 * @param {Array} fileExtensionsToExclude - A list of extension to exclude from the check
 * @param {Array} fileNamesToExclude - A list of file names to exclude. Defaults exclude Mac's
 * `.DS_Store`, and revision folders `.git` and `.svn`.
 */
exports.checkIfModifiedAfterFileDate = function(builtFile, foldersToCheck, fileExtensionsToExclude = [], fileNamesToExclude = [ ".DS_Store", ".git", ".svn" ]) {
	var buildFileStat = nova.fs.stat(builtFile);
	if(nova.inDevMode()) {
		exports.consoleNoteAndObject("nova-utils.checkIfModifiedAfterFileDate() Output file is [[[[" + builtFile + "]]]]] buildFileStat: ",buildFileStat);
		exports.consoleNoteAndObject("nova-utils.checkIfModifiedAfterFileDate() fileExtensionsToExclude: ",fileExtensionsToExclude);
		exports.consoleNoteAndObject("nova-utils.checkIfModifiedAfterFileDate() fileNamesToExclude: ",fileExtensionsToExclude);
	}

	if(buildFileStat!=undefined) {
		if(nova.inDevMode()) { console.log("nova-utils.checkIfModifiedAfterFileDate() Output file exists... Check if any file has changed since last file time of " + buildFileStat.mtime.getTime()); }
		function anyFileModifiedAfter(referenceFileTime, folderPath) {
			// Helper to recursively check files in a folder
			function checkFolderRecursive(path) {
				const entries = nova.fs.listdir(path);

				for (const entry of entries) {
					if(!exports.shouldIgnoreFileName(entry, fileNamesToExclude, fileExtensionsToExclude)) {
						const fullPath = nova.path.join(path, entry);
						const stat = nova.fs.stat(fullPath);
						if(stat) {
							if(nova.inDevMode()) {
								console.log("nova-utils.checkIfModifiedAfterFileDate() CHECKING " + entry);
							}

							if (stat.isDirectory()) {
								if(nova.inDevMode()) { console.log("nova-utils.checkIfModifiedAfterFileDate() Going into folder: " + entry); }
								if (checkFolderRecursive(fullPath)) {
									return true;
								}
							} else {
								if (stat.mtime.getTime() > referenceFileTime) {
									if(nova.inDevMode()) { console.log(`nova-utils.checkIfModifiedAfterFileDate() Modified file found: ${fullPath} at` + stat.mtime.getTime()); }
									return true;
								}
							}
						}
					} else {
						if(nova.inDevMode()) { console.log("nova-utils.checkIfModifiedAfterFileDate() Ignoring " + entry); }
						continue;
					}
				}
				return false;
			}
			return checkFolderRecursive(folderPath);
		}

		// Setup files to ignore when checking:
		for(var folder of foldersToCheck) {
			if(anyFileModifiedAfter(buildFileStat.mtime.getTime(), folder)) {
				if(nova.inDevMode()) { console.log("nova-utils.checkIfModifiedAfterFileDate() !#! TRUE, At least one file was modified after the timestamp."); }
				return true;
			}
		}
		if(nova.inDevMode()) { console.log("nova-utils.checkIfModifiedAfterFileDate() !#! FALSE, No files have changed since the last build."); }
		return false;
	} else {
		if(nova.inDevMode()) { console.log("nova-utils.checkIfModifiedAfterFileDate() !#! TRUE, Hey, there's no output, so there is a difference"); }
		return true;
	}
	if(nova.inDevMode()) { console.log("nova-utils.checkIfModifiedAfterFileDate() !#! Don't think we will get to here...."); }
	return false;
}

/**
 * Loop through each item in the releasePath, and if it's not the app.xml, copy it to the packing
 *
 * @param {string} folderPath - The folder path to look through
 * @param {string} relativePath - The relative path name from this directory
 * @returns {Array} - Files names with path
 */
exports.listFilesRecursively = function(folderPath, relativePath = "") {
	let fileList = [];
	try {
		nova.fs.listdir(folderPath).forEach(filename => {
			let fullPath = nova.path.join(folderPath, filename);
			let currentRelativePath = nova.path.join(relativePath, filename);

			if (nova.fs.stat(fullPath).isDirectory()) {
				// Recurse into subdirectory and add the returned files to the list
				fileList = fileList.concat(exports.listFilesRecursively(fullPath, currentRelativePath));
			} else {
				// Add the relative file path to the list
				fileList.push(currentRelativePath);
			}
		});
	} catch (error) {
		console.error(`nova-utils.listFilesRecursively() *** ERROR: Problem reading folder ${folderPath}: ${error} ***`);
	}
	return fileList;
}

/* ---- Customizable JSON ----  */

/**
 * This will allow get a file of JSON and return it. If it does not exist in the user's extension
 * storage, it will copy a default one from the extension.
 * @TODO Eventually, the user can modify and then save that JSON for custom values in a dropdown
 *
 * @param {string} filename - The name of the file to load. No path, extension figures it out!
 * It will be reside in the root of `nova.extension.globalStoragePath`, or in a `tempdir` if developing
 * and the extension is not installed! This will also need to have a file in your extension under the
 * folder `Defaults` in order to get the uncustomized default file.
 */
exports.getUserCustomizableJson = function(filename) {
	var values;
	var userFilePath = exports.determineUserCustomizableJsonLocation(filename);

	// If the user version of this file doesn't exist, then let's copy from the extension!
	if(exports.doesFileExist(userFilePath)==false) {
		var extDefault = exports.getStringOfFile(nova.path.join(nova.extension.path, "/Defaults/" + filename));
		exports.writeStringToFile(userFilePath,extDefault);
		values = JSON.parse(extDefault);
	} else {
		var options = exports.getStringOfFile(userFilePath);
		values = JSON.parse(options);
	}

	return values;
}

/**
 * This will get the correct path allow get a file of JSON and return it. If it does not exist in the user's extension
 * storage, it will copy a default one from the extension.
 * Eventually, the user can modify that JSON for custom values in a dropdown
 *
 * @param {string} filename - The name of the file to load. No path, extension figures it out!
 * It will be reside in the root of `nova.extension.globalStoragePath`, or in a `tempdir` if developing
 * and the extension is not installed! This will also need to have a file in your extension under the
 * folder `Defaults` in order to get the uncustomized default file.
 */
exports.determineUserCustomizableJsonLocation = function(filename) {
	var userFilePath = nova.path.join(nova.extension.globalStoragePath, "/" + filename);

	if(nova.inDevMode()) {
		if(exports.doesFolderExist(nova.extension.globalStoragePath)==false) {
			/* @NOTE If not installed, but developing, this "globalStoragePath" does NOT always exist!!!
			* It only exists if installed, so for testing, we're going to use this!
			*/
			userFilePath = nova.path.join(nova.fs.tempdir,"/" + filename);
			console.log("nova-utils.determineUserCustomizableJsonLocation() *** NOTE: Using tmp/ instead of globalStoragePath since this hasn't been `installed` yet! ***");
			// nova.fs.reveal(userFilePath); // Take a look an see if it's there!
		}
	}
}

/* ---- Network ---- */

/**
 * Tries to get the current device's IP. First searches with `networksetup` to find all the
 * connections, then goes through them to find the first one that reports back an IP. Should work
 * on desktop or laptop.
 */
exports.getIPAddress = function() {
	// Get the list of network devices on the machine, in order of preferences
	return exports.getProcessResults("/usr/sbin/networksetup", ["-listnetworkserviceorder"], "", {}, true).then((order) => {
		// If there's no devices...
		if(!order) {
			return null;
		}

		// Go through the output and find the devices
		var matches = [...order.stdout.matchAll(/Device:\s+(en\d+)/g)];
		// Map to interfaces
		var interfaces = matches.map(m => m[1]);

		var index = 0;
		// Helper function to go through and check ipconfig for the actual IP address.
		function tryNext() {
			if(index>=interfaces.length) {
				return Promise.resolve(null);
			}

			var iface = interfaces[index++];
			return exports.getProcessResults("usr/sbin/ipconfig", ["getifaddr",iface], "", {}, true).then((result) => {
				var ip = result.stdout;
				// If we have an IP address, then return that!
				if(ip && ip.trim().length>0) {
					return { interface: iface, ip: ip.trim() };
				}
			}).catch(() => {
				return tryNext();
			})
		};

		return tryNext();
	});
}

/* ---- Time ---- */

/**
 * Returns a string as a sortable timestamp.
 * @returns {String} - The current timestamp in YYYYMMDDD_HHmmss
 */
exports.getCurrentDateAsSortableString = function() {
	const now = new Date();

	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-based
	const day = String(now.getDate()).padStart(2, '0');
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');

	return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/* ---- UI Helpers ---- */

/**
 * Quick, easy way to show a notification. If you need it to persist, then add a button
 * to show. This does not resolve any buttons, just there to keep in place!
 *
 * @param {string} title - The title of the notification
 * @param {string} body - The text to display in the notification
 * @param {string} closeButtonName - Optional button, if there, it will keep the box open until
 * clicked
 * @param {string} requestIdAddition - If this is given, you can later use this ID to remove the
 * notification.
 */
exports.showNotification = function(title, body, closeButtonName = "", requestIdAddition = "") {
	// If there's another one, let's cancel it or it might not show up!
	if(requestIdAddition!="") {
		exports.cancelNotification(requestIdAddition);
	}
	let request = new NotificationRequest(nova.extension.identifier+requestIdAddition);

	request.title = nova.localize(title);
	request.body = nova.localize(body);
	if(closeButtonName) {
		request.actions = [ closeButtonName ];
	}
	nova.notifications.add(request);
}

/**
 * Removes a notification (which would have been launched with `showNotification()`.
 *
 * @param {string} requestIdAddition - The ID of the notification to remove
 */
exports.cancelNotification = function(requestIdAddition) {
	nova.notifications.cancel(nova.extension.identifier+requestIdAddition);
}

/**
 * Shows a Choice Palette, with the option of an "All" at the top.
 *
 * @param {Array} items - The items to show in the list
 * @param {String} placeholder - The initial item or placeholder
 * @param {boolean} addAll - Optional: Include an "All" item at the top
 */
exports.quickChoicePalette = function(items, placeholder, addAll = false) {
	return new Promise((resolve) => {
		if(addAll) {
			items.unshift( "All" );
		}

		nova.workspace.showChoicePalette(items, {
			placeholder: placeholder,
		}, (value,index) => {
			/*
			nova.workspace.showInformativeMessage(`Got choice: [[${value}]]`);
			console.log("Got choice:", value);
			console.log("Got index:", index);
			*/
			resolve({ value, index });
		});
	})
}

/**
 * Represents the objects that are used for the `collectInput` function
 * @typedef {Object} CollectInputPrompt
 * @property {string} message - What text will be displayed as the panel body
 * @property {string} label - Optional: Label to display before the input field
 * @property {string} value - Default value to display, default is blank
 * @property {string} placeholder - Text to display if no value is present or empty
 * @property {Boolean} isRequired - If set to true, the textfield will display as dots
 * @property {string} prompt - Text to display instead for the “OK” button
 * value is empty.
 * @property {string} isSecure - Optional: if the input should be masked out
 */

/**
 * Asks several text prompts and then resolves with all the answers
 *
 * @param {Array<CollectInputPrompt>} prompts - An Array of CollectInputPrompt to be asked.
 * @returns {Array<String>} - An array containing the text values that were entered
 */
exports.collectInput = function(prompts) {
	return new Promise((resolve) => {
		let results = [];
		let index = 0;

		function askNext(additionalMessage = "") {
			if (index < prompts.length) {
				const prompt = prompts[index];
				nova.workspace.showInputPanel(
					prompt.message + additionalMessage,
					{
						label: prompt.label || "",
						placeholder: prompt.placeholder || "",
						value: prompt.value || "",
						isSecure: prompt.isSecure || false,
						prompt: prompt.prompt || ""
					},
					(result) => {
						if (result===null || result===undefined) {
							// User canceled the input, resolve early with null
							resolve(null);
						} else if (prompt.isRequired && result.trim() === "") {
							// If input is required and empty, show the same prompt again
							askNext("\nInput cannot be empty. Please try again.");
						} else {
							results.push(result);
							index++;
							// Ask the next question
							askNext();
						}
					}
				);
			} else {
				// All prompts completed, resolve with the collected results
				resolve(results);
			}
		}
		askNext();
	});
}

/* ---- Not used ---- */

/**
 * (NOT USED) Convert's a document's selected range
 *
 * @param {TextDocument} document - The text document that's open
 * @param {Range} range - The selected range?
 */
exports.rangeToLspRange = function(document, range) {
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
}

