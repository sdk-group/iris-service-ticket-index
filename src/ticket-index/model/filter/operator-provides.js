'use strict';

let hasIntersection = require("../util/has-intersection.js");

module.exports = function (prefiltered, source, params) {
	let l = prefiltered.length,
		i = 0,
		src;
	while (l--) {
		if (!prefiltered[i]) continue;
		src = source[prefiltered[i]];

		if (src.properties.operator && !hasIntersection(params.operator, src.properties.operator))
			prefiltered[i] = false;
		i++;
	}
	return prefiltered;
};