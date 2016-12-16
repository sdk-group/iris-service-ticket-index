'use strict';

module.exports = function (start, source, params) {
	// console.log("____________PREBOOK_____________________>>>>>>>>>>>>>>>>>>>");
	// console.log(source);
	// console.log("START", start, params);
	// _.map(source, (src, i) => {
	// 	console.log(i, ":", src.id, src.properties.label);
	// })
	// console.log('po', start);
	let l = start.length,
		i = 0,
		j = 0,
		prebook_idx = [],
		head_idx = 0,
		separator = params.now + params.prebook_separation_interval;

	while (l--) {
		if (source[start[i]].properties.booking_method == 'prebook') {
			prebook_idx.push(start[i]);
		}
		i++;
	}

	l = prebook_idx.length;
	start.splice(-l, l);

	// console.log("TIMEMARKS", prebook_idx);
	// console.log("START", start);

	function comparator(a, b) {
		let atick = source[a],
			btick = source[b];
		return atick.time_description[0] - btick.time_description[0];
	}
	prebook_idx.sort(comparator);
	// console.log("PBIDX SORTED", prebook_idx);
	while (l--) {
		// console.log("PBIDX", prebook_idx[j], source[prebook_idx[j]].properties.label, source[prebook_idx[j]].properties.time_description[0], separator, source[prebook_idx[j]].properties.time_description[0] <= separator);
		if (source[prebook_idx[j]].properties.time_description[0] <= separator) {
			start.splice(head_idx, 0, prebook_idx[j]);
			head_idx++;
		} else {
			start.push(prebook_idx[j]);
		}
		j++;
	}
	// console.log("START", start);


	return start;
};