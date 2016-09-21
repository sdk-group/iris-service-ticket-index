'use strict';

let Session = require("ticket-session");
let moment = require("moment-timezone");

class AggregatorSection {
	constructor(patchwerk, name, keydata = {}) {
		this.name = name;
		this.keydata = keydata;
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
		return this;
	}

	addr() {
		return this.keydata.emit_path;
	}

	moment() {
		return moment.tz(this.keydata.org_timezone);
	}

	//search
	session(id) {
		// console.log("GETSESSION", code, this.keymap);
		return this.data[this.keymap[id]];
	}

	ticket(idx) {
		return this.rendered[idx];
	}

	//update
	updateLeaf(leaf) {
		//@FIXIT: switch to ticket models
		let session = this.session(leaf.session);
		let tick = session.find(leaf.id);
		// console.log("UPDATE", leaf, tick, session);
		tick.getContainer()
			.update(leaf);
		this.render();
		this.order();
	}

	next(curr_idx) {
		let session = this.session(this.rendered[curr_idx].code);
		return session.next();
	}


	order(params = {}) {
		let curr_moment = this.moment();
		params.date = curr_moment.format('YYYY-MM-DD');
		params.now = curr_moment.diff(curr_moment.clone()
			.startOf('day'), 'seconds');
		this.ordering.run(params, false, this.getRendered());
		return this;
	}

	filter(params = {}) {
		let curr_moment = this.moment();
		params.prebook_show_interval = this.keydata.prebook_show_interval;
		params.now = curr_moment.diff(curr_moment.clone()
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
		console.log("INVALIDATE", this.constructor.name);
		this._invalid = true;
	}

	invalid() {
		return this._invalid;
	}

	validate() {
		console.log("VALIDATE");
		this._invalid = false;
	}

	flush() {
		this.data = [];
		//mb destruct all sessions? they have circular dependencies
	}

	add(session) {
		//only today
		if (this.moment()
			.format('YYYY-MM-DD') !== session.dedication())
			return this;

		let id = session.identifier();
		session.onUpdate(this.invalidate.bind(this));

		if (this.keymap[id] === undefined) {
			this.data.push(session);
			this.keymap[id] = this.data.length - 1;
		} else {
			this.data[this.keymap[id]] = session;
		}
		this.invalidate();
		return this;
	}

	loadIfOutdated() {
		//it is logical because only today sessions can be added
		if (this.data.length > 0 && this.data[0].dedication() < this.moment()
			.format('YYYY-MM-DD')) {
			console.log("OUTDATED");
			this.flush();
			return this.load();
		} else {
			return Promise.resolve(true);
		}
	}

	load() {
		let date = this.moment()
			.format('YYYY-MM-DD');
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
		let date = this.moment()
			.format('YYYY-MM-DD');
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
		let tmp_session;
		return this.patchwerk.create('TicketSession', data, {
				department: data.organization,
				date: data.dedicated_date,
				counter: "*"
			})
			.then((session) => {
				tmp_session = session;
				return Promise.map(data.uses, t_id =>
					this.patchwerk.get('Ticket', {
						key: t_id
					}));
			})
			.then(t_data => {
				return Session(tmp_session, t_data);
			});

	}

	createTickets(data) {
		let b_data = data.constructor === Array ? data : [data];

		return Promise.map(b_data, t_data => {
			t_data.booking_date = this.moment()
				.format();
			console.log("TDATA", t_data);
			let service_data;
			return this.patchwerk.get('Service', {
					department: this.keydata.id,
					counter: _.last(_.split(t_data.service, '-'))
				})
				.then(srv => {
					service_data = srv;
					return this.patchwerk.create('Ticket', t_data, {
						department: t_data.org_destination,
						date: t_data.dedicated_date,
						counter: "*"
					});
				})
				.then(tick => {
					// console.log("a-s crticks", tick);
					tick.lockField('operator')
						.lockField('destination')
						.modifyPriority('service', service_data.get('priority'))
						.appendLabel(service_data.get('prefix'));
					// console.log("a-s crticks II", tick);

					if (tick.get('booking_method') == 'live')
						tick.set('time_description', service_data.live_operation_time);
					return tick;
				});
		})
	}
}

module.exports = AggregatorSection;