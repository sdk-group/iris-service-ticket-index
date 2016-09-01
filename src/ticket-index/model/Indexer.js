'use strict';

class Indexer {
	constructor(category, fns = []) {
		this.result = null;

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

	out() {
		return this.result;
	}

	clear() {
		this.result = null;
		return this;
	}

	run(params, initial_idx) {
		let source = this.source.getRendered();
		let res = initial_idx || Object.keys(source),
			l = this._chainsz;
		while (l--) {
			res = this._middleware[this._chainsz - l - 1](res, source, params);
		}
		this.result = res;
		return this;
	}
}


module.exports = Indexer;