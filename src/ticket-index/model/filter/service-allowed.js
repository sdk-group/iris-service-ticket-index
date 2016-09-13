'use strict';

module.exports = function (prefiltered, source, params) {
	console.log("srv-allowed", prefiltered);
	let l = prefiltered.length,
		i = 0,
		src;
	while (l--) {
		if (!prefiltered[i]) continue;
		src = source[prefiltered[i]];
		if (params.service !== '*' && !~params.service.indexOf(src.properties.service))
			prefiltered[i] = false;
		i++;
	}
	return prefiltered;
};