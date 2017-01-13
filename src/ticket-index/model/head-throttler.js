class HeadThrottler {
	constructor() {
		this._ttl = 0;
		this._timers = {};
		this._timestamps = {};
	}

	ttl(ttl) {
		if (!_.isNumber(ttl))
			return;
		this._ttl = ttl;
	}

	_expired(key) {
		return ((this._timestamps[key] || 0) < _.now() - this._ttl);
	}

	_runTrailless(func, args) {
		console.log("RUN TRAIILLESS", this._timestamps, _.isFunction(func));
		if (!_.isFunction(func))
			return;
		return func(args);
	}


	_run(func, args) {
		let key = args.organization;
		return () => {
			console.log("RUN TRAIL", this._timestamps[key] - _.now());
			this._timestamps[key] = _.now();
			return func(args);
		}
	}

	runOrTrail(func, args) {
		if (args.operator || args.workstation)
			return this._runTrailless(func, args);
		let key = args.organization;
		let time = _.now() - (this._timestamps[key] || 0);
		console.log("TIME", time, time > this._ttl);
		if (time > this._ttl) {
			//ttl elapsed
			setImmediate(this._run(func, args));
		} else {
			// ttl still not elapsed, set timeout if not set already
			console.log("LEFT--------------------------------->\n", this._ttl - time);
			clearTimeout(this._timers[key]);
			this._timers[key] = setTimeout(this._run(func, args), this._ttl - time);
		}
	}
}

let instance = new HeadThrottler();
module.exports = instance;