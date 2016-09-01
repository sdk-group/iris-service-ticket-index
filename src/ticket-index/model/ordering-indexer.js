'use strict'

let Indexer = require("./indexer.js");

class OrderingIndexer extends Indexer {
	constructor(fns) {
		super('order', fns);
	}

}

module.exports = OrderingIndexer;