'use strict';

module.exports = function (start, source, params) {
	console.log("____________PREBOOK_____________________>>>>>>>>>>>>>>>>>>>");
	// console.log(source);
	console.log("START", start);
	_.map(source, (src, i) => {
		console.log(i, ":", src.id, src.properties.label);
	})
	console.log('po', start);
	let l = start.length,
		pl,
		len = l,
		plen = l,
		i = 0,
		j = 0,
		timemarks = Array(l),
		prebook_idx = [],
		prior_idx = [],
		prev = _.parseInt(params.now),
		insert_success = false,
		p_cond;

	while (l--) {
		if (source[start[i]].properties.booking_method == 'live') {
			p_cond = source[start[i]].priority_value > 0;
			if (p_cond) {
				prior_idx.push(start[i]);
			} else {
				timemarks[i] = prev + _.parseInt(source[start[i]].properties.time_description);
				prev = timemarks[i];
			}
		} else {
			timemarks[i] = prev;
			prebook_idx.push(start[i]);
		}
		i++;
	}

	l = prebook_idx.length;
	start.splice(-l, l);
	pl = prior_idx.length;
	start.splice(0, pl);
	timemarks.splice(0, pl);

	console.log("TIMEMARKS", timemarks, prebook_idx, prior_idx);
	console.log("START", start);

	function comparator(a, b) {
		let atick = source[a],
			btick = source[b];
		return atick.time_description[0] - btick.time_description[0];
	}
	prebook_idx.sort(comparator);

	while (l--) {
		// console.log("PBIDX", prebook_idx[l]);
		while (len--) {
			j = plen - len - 1;
			// console.log(j, timemarks[j], source[prebook_idx[l]].properties.time_description[0]);

			if (timemarks[j] >= source[prebook_idx[l]].properties.time_description[0]) {
				start.splice(j, 0, prebook_idx[l]);
				insert_success = true;
				break;
			}
		}
		if (!insert_success)
			start.push(prebook_idx[l]);
		insert_success = false;
		len = plen;
	}
	while (pl--) {
		start.unshift(prior_idx[pl]);
	}
	console.log("START", start);

	return start;
};