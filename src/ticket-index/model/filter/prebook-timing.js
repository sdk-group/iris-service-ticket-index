'use strict';

module.exports = function (prefiltered, source, params) {
	console.log("pb-timing", prefiltered, params);
	let l = prefiltered.length,
		i = 0,
		src;
	while (l--) {
		if (!prefiltered[i]) continue;
		src = source[prefiltered[i]];
		if (src.properties.booking_method == 'prebook' &&
			src.properties.time_description[0] > (params.now + params.prebook_show_interval + 30))
		{
			console.log(src.properties.time_description[0], params.now, (params.now + params.prebook_show_interval + 30));
			prefiltered[i] = false;
		}
		i++;
	}
	return prefiltered;
};