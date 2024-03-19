exports.getTag = function(xml, tag) {
	try {
		return String(xml.select("//"+tag)).trim();
	} catch(e) {
		return "";
	}
}

exports.getTagAttribute = function(xml, tag, attr) {
	try {
		return String(xml.select("//"+tag)["attributes"][attr]).trim();
	} catch(e) {
		return "";
	}
}

exports.getAttribute = function(xml, attr) {
	try {
		return String(xml["attributes"][attr]).trim();
	} catch(e) {
		return "";
	}
}
