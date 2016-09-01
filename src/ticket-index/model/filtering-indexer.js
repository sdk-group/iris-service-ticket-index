'use strict'

let Indexer = require("./indexer.js");

class FilteringIndexer extends Indexer {
	constructor(filters) {
		super('filter', filters);
	}

}

module.exports = FilteringIndexer;