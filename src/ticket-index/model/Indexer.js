'use strict';

class Indexer {
	constructor(category, fns = []) {
		let l = fns.length;
		this._middleware = Array(l);
		while (l--) {
			this._middleware[l] = require(`./${category}/${fns[l]}.js`);
		}
		this._chainsz = this._middleware.length;
	}

	setSource(src) {
		this.source = src;
	}


	run(params, initial_idx) {
		let source = this.source.getRendered();
		let res = initial_idx || Object.keys(source),
			l = this._chainsz;
		while (l--) {
			res = this._middleware[this._chainsz - l - 1](res, source, params);
		}
		return res;
	}
}


module.exports = Indexer;