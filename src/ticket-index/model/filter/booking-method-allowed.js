'use strict';

module.exports = function (prefiltered, source, params) {
	console.log("state", prefiltered);
	let l = prefiltered.length,
		i = -1,
		src;

	while (l--) {
		i++;
		if (!prefiltered[i]) continue;
		src = source[prefiltered[i]];
		if (params.booking_method !== "*" && !hasIntersection(params.booking_method, src.properties.booking_method)) {
			prefiltered[i] = false;
		}
	}
	return prefiltered;
};