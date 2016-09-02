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

	run(params, initial_idx) {
		this.result = super.run(params, initial_idx);
		console.log(this.result);
		return this;
	}
}

module.exports = OrderingIndexer;