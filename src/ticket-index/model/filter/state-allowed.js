'use strict';

module.exports = function (prefiltered, source, params) {
	let l = prefiltered.length,
		i = 0,
		src;

	while (l--) {
		if (!prefiltered[i]) continue;
		src = source[prefiltered[i]];
		if (params.state !== '*' && !~params.state.indexOf(src.properties.state))
			prefiltered[i] = false;
		i++;
	}
	return prefiltered;
};