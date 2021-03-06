'use strict';

class Indexer {
	constructor(category, fns = []) {
		let l = fns.length;
		this._middleware = Array(l);
		while (l--) {
			this._middleware[l] = require(`./${category}/${fns[l]}.js`);
		}
		this._chainsz = this._middleware.length;
		this._category = category;
	}

	run(params, initial_idx, data) {
		let source = data;
		let res = initial_idx || Object.keys(source),
			l = this._chainsz;
		// console.log("INDEXER STARTIDX", res, params);
		while (l--) {
			res = this._middleware[this._chainsz - l - 1](res, source, params);
			// console.log(res);
		}
		return res;
	}

	addMiddleware(fn) {
		this._middleware[this._chainsz] = require(`./${this._category}/${fn}.js`);
		this._chainsz++;
	}
}


module.exports = Indexer;