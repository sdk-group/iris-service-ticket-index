'use strict';

module.exports = function (start, source, params) {
	// console.log("____________PREBOOK_____________________>>>>>>>>>>>>>>>>>>>");
	// console.log(source);
	// console.log("START", start);
	// _.map(source, (src, i) => {
	// console.log(i, ":", src.id, src.properties.label);
	// })
	// console.log('po', start);
	let l = start.length,
		len = l,
		pl,
		i = 0,
		prior_idx = [],
		rest_idx = [],
		insert_success = false,
		p_cond;

	while (l--) {
		if (source[start[i]].properties.booking_method == 'live' && source[start[i]].priority_value > 0) {
			prior_idx.push(start[i]);
			start.splice(i, 1);
		} else {
			i++;
		}
	}

	pl = prior_idx.length;

	while (pl--) {
		start.unshift(prior_idx[pl]);
	}
	// console.log("START", start);

	return start;
};