'use strict'

let Indexer = require("./indexer.js");

class OrderingIndexer extends Indexer {
	constructor(fns) {
		super('order', fns);
		this.result = null;
	}
	out() {
		return this.result;
	}

	clear() {
		this.result = null;
		return this;
	}

	run(params, initial_idx, data) {
		this.result = super.run(params, initial_idx, data);
		// console.log("ORDERING INDEXER", initial_idx, this.result);
		return this;
	}
}

module.exports = OrderingIndexer;