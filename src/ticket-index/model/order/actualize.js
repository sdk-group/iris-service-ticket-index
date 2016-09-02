'use strict';

module.exports = function (prefiltered, source, params) {
	let l = prefiltered.length,
		i = 0,
		src;
	while (l--) {
		src = source[prefiltered[i]];
		if (src.properties.dedicated_date !== params.date) {
			prefiltered.splice(i, 1);
		} else {
			i++;
		}
	}
	return prefiltered;
};