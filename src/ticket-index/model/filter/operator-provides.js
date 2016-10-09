'use strict';

let hasIntersection = require("../util/has-intersection.js");

module.exports = function (prefiltered, source, params) {
	// console.log("op-prov", prefiltered);
	let l = prefiltered.length,
		i = -1,
		src;
	while (l--) {
		i++;
		if (!prefiltered[i]) continue;
		src = source[prefiltered[i]];

		if (src.properties.operator && !hasIntersection(params.operator, src.properties.operator))
			prefiltered[i] = false;
	}
	return prefiltered;
};