'use strict';

let Session = require("ticket-session");
let moment = require("moment-timezone");

class AggregatorSection {
	constructor(patchwerk, name, keydata = {}) {
		this.name = name;
		this.keydata = keydata;
		this.moment = moment.tz(this.keydata.org_timezone);
		this.patchwerk = patchwerk;

		this.keymap = {};
		this.data = [];
		this.rendered = [];

		this.filtering = null;
		this.ordering = null;
		this._invalid = true;
	}

	updateKeydata(value) {
		this.keydata = value;
		this.moment = moment.tz(this.keydata.org_timezone);
		return this;
	}

	addr() {
		return this.keydata.emit_path;
	}

	session(code) {
		console.log("GETSESSION", code, this.keymap);
		return this.data[this.keymap[code]];
	}

	ticket(idx) {
		return this.rendered[idx];
	}

	updateLeaf(leaf) {
		//@FIXIT: switch to ticket models
		let session = this.session(leaf.code);
		let tick = session.find(leaf.id);
		console.log("UPDATE", leaf, tick, session);
		tick.getContainer()
			.update(leaf);
		this.render();
		this.order();
	}

	next(curr_idx) {
		let session = this.session(this.rendered[curr_idx].code);
		return session.next();
	}

	active() {
		let l = this.data.length,
			res = [],
			curr;

		while (l--) {
			curr = this.data[l].current();
			if (curr) {
				res.push(curr);
			}
		}
		return res;
	}

	order(params = {}) {
		params.date = this.moment.format('YYYY-MM-DD');
		params.now = this.moment.diff(this.moment.clone()
			.startOf('day'), 'seconds');
		this.ordering.run(params, false, this.getRendered());
		return this;
	}

	filter(params = {}) {
		params.prebook_show_interval = this.keydata.prebook_show_interval;
		params.now = this.moment.diff(this.moment.clone()
			.startOf('day'), 'seconds');
		params.state = params.state || '*';
		return this.filtering.run(params, this.ordering.out(), this.getRendered());
	}

	setIndexers(filter, order) {
		this.filtering = filter;
		this.ordering = order;
	}

	render() {
		let result = [],
			l = this.data.length;
		this.rendered = [];
		while (l--) {
			this.rendered = this.rendered.concat(this.data[l].render());
		}
		console.log("RENDER");
		this.validate();
		return this.rendered;
	}

	getRendered() {
		//can implement render expiration here
		//if(expired) return this.render()
		if (this.invalid()) {
			this.render();
		}
		return this.rendered;
	}

	invalidate() {
		console.log("INVALIDATE");
		this._invalid = true;
	}

	invalid() {
		return this._invalid;
	}

	validate() {
		console.log("VALIDATE");
		this._invalid = false;
	}

	add(session) {
		let id = session.code();
		session.onUpdate(this.invalidate);

		if (this.keymap[id] === undefined) {
			this.data.push(session);
			this.keymap[id] = this.data.length - 1;
		} else {
			this.data[this.keymap[id]] = session;
		}
		console.log("ADD", session.code());
		this.invalidate();
	}

	load() {
		let date = this.moment.format('YYYY-MM-DD');
		return Promise.all([this.patchwerk.get('TicketSession', {
				department: this.name,
				date: date,
				counter: '*'
			}), this.patchwerk.get('Ticket', {
				department: this.name,
				date: date,
				counter: '*'
			})])
			.then(res => {
				// console.log(res);
				let sessions = res[0],
					l = sessions.length,
					session_data;

				while (l--) {
					session_data = sessions[l];
					//@FIXIT
					if (session_data.properties.description !== undefined) {
						this.add(Session(session_data, res[1]));
					}
				}

				// console.log("SESSIONS", this);
				return this;
			})
	}

	saveSession(session) {
		let model = session.extract();
		let date = this.moment.format('YYYY-MM-DD');
		return this.patchwerk.save(model, {
				department: this.name,
				date: date
			})
			.then(res => this.patchwerk.create('TicketSessionLookup', {
				content: session.identifier()
			}, {
				code: session.code()
			}))
			.then(lookup => this.patchwerk.save(lookup, {
				code: session.code()
			}))
			.then(res => session);
	}


	createSession(data) {
		return Promise.all([this.patchwerk.create('TicketSession', data, {
				department: data.organization,
				date: data.dedicated_date,
				counter: "*"
			}), this.patchwerk.get('Ticket', {
				department: data.organization,
				date: data.dedicated_date,
				counter: _.map(data.uses, id => id.split('--')[1])
			})])
			.then((res) => {
				return Session(res[0], res[1]);
			});

	}
}

module.exports = AggregatorSection;