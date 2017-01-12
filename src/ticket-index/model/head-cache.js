class HeadCache {
	constructor() {
		this._ttl = 0;
		this._content = {};
		this._timestamps = {};
	}

	ttl(ttl) {
		if (!_.isNumber(ttl))
			return;
		this._ttl = ttl;
	}

	getCache(...keyparts) {
		let key = keyparts.join(".");
		if (this._expired(key)) {
			this.delCache(key);
		}
		return this._content[key];
	}

	setCache(data, ...keyparts) {
		let key = keyparts.join(".");
		this._content[key] = data;
		this._timestamps[key] = _.now();
	}

	delCache(...keyparts) {
		let key = keyparts.join(".");
		this._timestamps[key] = 0;
		this._content[key] = false;
	}

	_expired(key) {
		return ((this._timestamps[key] || 0) < _.now() - this._ttl);
	}
}

let instance = new HeadCache();
module.exports = instance;