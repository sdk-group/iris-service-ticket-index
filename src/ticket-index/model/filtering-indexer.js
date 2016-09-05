'use strict'

let Indexer = require("./indexer.js");

class FilteringIndexer extends Indexer {
	constructor(filters) {
		super('filter', filters);
	}

	run(params, initial_idx, data) {
		let res = super.run(params, initial_idx.slice(), data);
		let i, l = res.length,
			compacted = [];
		for (i = 0; i < l; i++) {
			if (res[i] !== false)
				compacted.push(res[i]);
		}
		return compacted;
	}
}

module.exports = FilteringIndexer;