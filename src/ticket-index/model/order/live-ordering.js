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
		let atime = moment(atick.properties.booking_date)
			.unix();
		let btime = moment(btick.properties.booking_date)
			.unix();
		let alabel = parseInt(atick.label.slice(_.lastIndexOf(atick.label, '-') + 1));
		let blabel = parseInt(btick.label.slice(_.lastIndexOf(btick.label, '-') + 1));
		if (atick.priority_value > btick.priority_value ||
			atick.priority_value == btick.priority_value && atime < btime ||
			atick.priority_value == btick.priority_value && atime == btime && alabel < blabel)
			return -1;
		else
			return 1;
	}
	start.sort(comparator);
	return start;
};