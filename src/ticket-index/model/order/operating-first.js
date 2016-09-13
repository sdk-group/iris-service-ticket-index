'use strict';

module.exports = function (start, source, params) {
	console.log('of', start);

	function comparator(a, b) {
		let atick = source[a],
			btick = source[b];
		if (atick.properties.state == 'processing' || atick.properties.state == 'called')
			return -1;
		if (btick.properties.state == 'processing' || btick.properties.state == 'called')
			return 1;
	}
	start.sort(comparator);
	return start;
};