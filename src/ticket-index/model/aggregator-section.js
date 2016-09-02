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
		this._invalid = false;
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
		return this.data[this.keymap[code]];
	}

	updateLeaf(leaf) {
		//@FIXIT: switch to ticket models
		let tick = this.session(leaf.code)
			.find(leaf.id);
		console.log("UPDATE", leaf, tick);
		tick.getContainer()
			.update(leaf);
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
		this.ordering.run(params);
		return this;
	}

	filter(params = {}) {
		params.prebook_show_interval = this.keydata.prebook_show_interval;
		params.now = this.moment.diff(this.moment.clone()
			.startOf('day'), 'seconds');
		params.state = params.state || '*';
		return this.filtering.run(params, this.ordering.out());
	}

	setIndexers(filter, order) {
		this.filtering = filter;
		this.filtering.setSource(this);

		this.ordering = order;
		this.ordering.setSource(this);
	}

	render() {
		let result = [],
			l = this.data.length;
		this.rendered = [];
		while (l--) {
			this.rendered = this.rendered.concat(this.data[l].render());
		}
		return this.rendered;
	}

	getRendered() {
		//can implement render expiration here
		//if(expired) return this.render()
		if (this.invalid()) {
			this.render();
			this.order();
		}
		return this.rendered;
	}

	invalidate() {
		this._invalid = true;
	}

	invalid() {
		return this._invalid;
	}

	validate() {
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