'use strict';

class IndexDispenser {
	constructor(index) {
		this.aggregator = index;
	}

	// methods
	dispense(section, size, prefiltered) {
		let source = this.aggregator.section(section)
			.getRendered();
		let idx = prefiltered || Object.keys(source),
			l = idx.length,
			i, src;
		let result = {
			live: {
				tickets: [],
				count: 0
			},
			postponed: {
				tickets: [],
				count: 0
			}
		};
		for (i = 0; i < l; i++) {
			src = source[idx[i]];
			let serialized = src.serialize();

			switch (src.properties.state) {
			case 'registered':
				if (result.live.count < size) {
					result.live.tickets.push(serialized);
				}
				result.live.count++;
				break;
			case 'processing':
				result.live.tickets.unshift(serialized);
				break;
			case 'called':
				result.live.tickets.unshift(serialized);
				break;
			case 'postponed':
				if (result.postponed.count < size) {
					result.postponed.tickets.push(serialized);
				}
				result.postponed.count++;
				break;
			default:
				break;
			}
		}

		return result;

	}

	findIndex(section, code, prefiltered) {
		let source = this.aggregator.section(section)
			.getRendered();
		let idx = prefiltered || Object.keys(source),
			l = idx.length,
			res = -1,
			i, pc = 0,
			src;
		for (i = 0; i < l; i++) {
			src = source[idx[i]];
			if (src.properties.state == 'postponed')
				pc++;
			if (src.properties.code == code)
				res = i;
		}
		return res < 0 ? res : res + pc;

	}
}

module.exports = function (index) {
	return new IndexDispenser(index);
};