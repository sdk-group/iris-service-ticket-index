'use strict';

let hasIntersection = require("../util/has-intersection.js");

module.exports = function (prefiltered, source, params) {
	// console.log("univ", prefiltered);
	let l = prefiltered.length,
		i = -1,
		src;
	while (l--) {
		i++;
		if (!prefiltered[i]) continue;
		src = source[prefiltered[i]];


		if (src.properties.destination && !hasIntersection(params.destination, src.properties.destination)) {
			prefiltered[i] = false;
			continue;
		}

		if (src.properties.operator && !hasIntersection(params.operator, src.properties.operator)) {
			prefiltered[i] = false;
			continue;
		}


		if (params.state !== '*' && !~params.state.indexOf(src.properties.state)) {
			prefiltered[i] = false;
			continue;
		}

		if (params.service !== '*' && !~params.service.indexOf(src.properties.service)) {
			prefiltered[i] = false;
			continue;
		}

		if (src.properties.booking_method == 'prebook' &&
			src.properties.time_description[0] > (params.now + params.prebook_show_interval + 30)) {
			prefiltered[i] = false;
			continue;
		}


	}
	return prefiltered;
};