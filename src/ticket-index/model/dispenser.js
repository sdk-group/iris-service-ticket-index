'use strict';

class IndexDispenser {
	constructor(index) {
		this.aggregator = index;
	}

	// methods
	dispense(section, size, filter) {
		let source = this.aggregator.section(section)
			.getRendered();
		let prefiltered = this.aggregator.filter(section, filter);
		// console.log(source);
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

	findIndex(section, id, filter) {
		let source = this.aggregator.section(section)
			.getRendered();

		this.aggregator.section(section)
			.order();
		// console.log("FINDINDEX");
		let prefiltered = this.aggregator.filter(section, filter);

		let idx = prefiltered || Object.keys(source),
			l = idx.length,
			res = -1,
			i, pc = 0,
			src;
		for (i = 0; i < l; i++) {
			src = source[idx[i]];
			// if (src.properties.state == 'postponed')
			// 	pc++;
			// console.log(src.properties.code, code);
			if (src.id == id)
				res = i;
		}
		return res < 0 ? res : res + pc;

	}
}

module.exports = function (index) {
	return new IndexDispenser(index);
};