/**
 * Quick, easy way to show a notification. If you need it to persist, then add a button
 * to show. This does not resolve any buttons, just there to keep in place!
 * @param {string} title - The title of the notification
 * @param {string} body - The text to display in the notification
 * @param {string} closeButtonName - Optional button, if there, it will keep the box open until
 * clicked
 */
exports.showNotification = function(title, body, closeButtonName = "") {
	//if (nova.inDevMode()) {
		let request = new NotificationRequest("as3mxml-nova-message");

		request.title = nova.localize(title);
		request.body = nova.localize(body);
		if(closeButtonName) {
			request.actions = [ closeButtonName ];
		}
		nova.notifications.add(request);
	//}
}

/**
 * Runs a process so that we get get the Promise when it's done.
 * @param {string} command - The command to use
 * @param {Array} args - An array with the arguments for the command (optional)
 * @param {string} cwd - The working directory (defaults to current, extension's directory)
 * @retruns {Promise} - If the status is 0, then it `resolves` otherwise `rejects`. Both will
 * return back an object containing status, stdout and stderr.
 */
exports.getProcessResults = function(command, args = [], cwd = "") {
	var proc = new Promise((resolve, reject) => {
		var stdout = "";
		var stderr = "";

		var process = new Process(command, { args: args, cwd: cwd });
		process.onStdout(line => stdout += line);
		process.onStderr(line => stderr += line);
		process.onDidExit(status => {
			/*
			console.log("getProcessResults() status: " + status);
			console.log("                    stdout: " + stdout);
			console.log("                    stderr: " + stderr);
			console.log("                    command: " + command);
			console.log("                    args: ");
			consoleLogObject(args);
			*/
			let results = { status: status, stdout: stdout, stderr: stderr };
			/*
			console.log("getProcessResults() results: ");
			consoleLogObject(results);
			*/
			if(status===0) {
				console.log("getProcessResults() Going to resolve...");
				resolve(results);
			} else {
				console.log("getProcessResults() Going to reject...");
				reject(results);
			}
		});
		process.start();
	});

	return proc;
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

exports.saveAllFiles = function() {
	nova.workspace.textEditors.forEach((editor)=> {
		editor.save();
	});
}

exports.consoleLogObject = function(object) {
	console.log(JSON.stringify(object,null,4));
}

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
};


