'use strict';

module.exports = function (prefiltered, source, params) {
	// console.log("srv-allowed", prefiltered, source, params);
	let l = prefiltered.length,
		i = -1,
		src;
	while (l--) {
		i++;
		if (!prefiltered[i]) continue;
		src = source[prefiltered[i]];
		if (params.service !== '*' && !~params.service.indexOf(src.properties.service))
			prefiltered[i] = false;
	}
	return prefiltered;
};