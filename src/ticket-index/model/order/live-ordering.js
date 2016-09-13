'use strict';

let moment = require('moment-timezone');


module.exports = function (start, source, params) {
	console.log('lo', start);

	function comparator(a, b) {
		let atick = source[a],
			btick = source[b];
		if (atick.properties.booking_method == 'prebook')
			return 1;
		if (btick.properties.booking_method == 'prebook')
			return -1;
		if (atick.priority_value > btick.priority_value ||
			atick.priority_value == btick.priority_value &&
			moment(atick.properties.booking_date)
			.unix() < moment(btick.properties.booking_date)
			.unix())
			return -1;
		else
			return 1;
	}
	start.sort(comparator);
	return start;
};