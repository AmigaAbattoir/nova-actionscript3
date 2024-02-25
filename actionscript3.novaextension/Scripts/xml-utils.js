exports.getTag = function(xml, tag) { return String(xml.select("//"+tag)).trim(); }

exports.getTagAttribute = function(xml, tag, attr) { return String(xml.select("//"+tag)["attributes"][attr]).trim(); }

exports.getAttribute = function(xml, attr) { return String(xml["attributes"][attr]).trim(); }
