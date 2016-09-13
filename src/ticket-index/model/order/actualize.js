'use strict';

module.exports = function (prefiltered, source, params) {
	console.log('act', prefiltered);
	let l = prefiltered.length,
		i = 0,
		src;
	while (l--) {
		src = source[prefiltered[i]];
		// console.log(src.properties.dedicated_date, params.date);
		if (src.properties.dedicated_date !== params.date) {
			// console.log(src);
			prefiltered.splice(i, 1);
		} else {
			i++;
		}
	}
	return prefiltered;
};