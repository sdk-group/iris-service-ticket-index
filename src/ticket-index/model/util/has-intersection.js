'use strict';

module.exports = function (arg1, arg2) {
	let res = false;
	if (arg1.constructor === Array) {
		if (arg2.constructor === Array) {
			let i = arg1.length;
			while (i--) {
				res = !!~arg2.indexOf(arg1[i]);
				if (res)
					break;
			}
		} else {
			res = !!~arg1.indexOf(arg2);
		}
	} else {
		if (arg2.constructor === Array) {
			res = !!~arg2.indexOf(arg1);
		} else {
			res = arg1 === arg2;
		}
	}
	return res;
};