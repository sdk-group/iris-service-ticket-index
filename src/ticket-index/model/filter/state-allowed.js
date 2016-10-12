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
		if (params.state !== '*' && !~params.state.indexOf(src.properties.state))
			prefiltered[i] = false;
	}
	return prefiltered;
};