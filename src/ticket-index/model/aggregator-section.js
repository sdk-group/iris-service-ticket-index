'use strict';

let Session = require("ticket-session");
let moment = require("moment-timezone");

class AggregatorSection {
	constructor(patchwerk, name, keydata = {}) {
		this.name = name;
		this.keydata = keydata;
		this.patchwerk = patchwerk;

		this.keymap_active = {};
		this.keymap_inactive = {};
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
		// console.log("GETSESSION", code, this.keymap_active);
		return this.data[this.keymap_active[id]] || this.data[this.keymap_inactive[id]];
	}

	sessionByLeaf(t_id) {
		let result,
			l = this.data.length,
			item, t_item;
		while (l--) {
			item = this.data[l];
			if (!item) continue;
			t_item = item.find(t_id);
			if (t_item)
				result = item;
		}
		return result;
	}

	ticket(idx) {
		return this.rendered[idx];
	}

	//update
	updateLeaf(leaf) {
		//@FIXIT: switch to ticket models

		let session = this.session(leaf.session) || this.sessionByLeaf(leaf.id);
		if (!session) {
			global.logger && logger.error({
				"module": "ticket-index",
				"method": "aggregator-section.updateLeaf",
				"message": "No such session",
				"data": leaf
			});
			return;
		}
		console.log("UPDATELEAF", leaf);
		session.update(leaf.id, leaf);
		console.log("addrs", session.isInactive(), this.keymap_active[leaf.session], this.keymap_inactive[leaf.session]);
		if (session.isInactive() && !!this.keymap_active[leaf.session]) {
			// console.log("swtiching to inactive", leaf.session);
			let pos = this.keymap_active[leaf.session];
			_.unset(this.keymap_active, leaf.session);
			this.keymap_inactive[leaf.session] = pos;
		}
		if (!session.isInactive() && this.keymap_inactive[leaf.session]) {
			// console.log("swtiching to active", leaf.session);
			let pos = this.keymap_inactive[leaf.session];
			_.unset(this.keymap_inactive, leaf.session);
			this.keymap_active[leaf.session] = pos;
		}
		this.invalidate();
		// this.render();
		// this.order();
	}

	next(curr_idx) {
		let session = this.session(this.rendered[curr_idx].get('session'));
		return session.next();
	}


	order(params = {}) {
		let curr_moment = this.moment();
		params.date = curr_moment.format('YYYY-MM-DD');
		params.now = curr_moment.diff(curr_moment.clone()
			.startOf('day'), 'seconds');
		params.prebook_separation_interval = this.keydata.prebook_separation_interval;
		this.ordering.run(params, false, this.rendered);
		return this;
	}

	filter(params = {}) {
		let curr_moment = this.moment();
		params.prebook_show_interval = this.keydata.prebook_show_interval;
		params.now = curr_moment.diff(curr_moment.clone()
			.startOf('day'), 'seconds');
		params.state = params.state || '*';
		return this.filtering.run(params, this.ordering.out(), this.rendered);
	}

	isAppliable(params = {}, entity) {
		return !!(this.filtering.run(params, ['0'], [entity]))[0];
	}

	setIndexers(filter, order) {
		this.filtering = filter;
		this.ordering = order;
	}

	render() {
		let keys = Object.keys(this.keymap_active),
			l = keys.length,
			item;
		this.rendered = [];
		while (l--) {
			item = this.data[this.keymap_active[keys[l]]];
			if (!item.isInactive())
				this.rendered = this.rendered.concat(item.render());
		}
		// console.log("RENDER");
		this.validate();
		return this.rendered;
	}

	allTickets() {
		let result = [],
			l = this.data.length,
			item;
		while (l--) {
			item = this.data[l];
			if (!item) continue;
			result = result.concat(item.tickets());
		}
		return result;
	}

	activeTickets() {
		let keys = Object.keys(this.keymap_active),
			l = keys.length,
			item;
		let result = [];
		while (l--) {
			item = this.data[this.keymap_active[keys[l]]];
			if (!item) continue;
			if (!item.isInactive())
				result = result.concat(item.tickets());
		}
		return result;
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
		// console.log("INVALIDATE", this.constructor.name);
		this._invalid = true;
	}

	invalid() {
		return this._invalid;
	}

	validate() {
		// console.log("VALIDATE");
		this._invalid = false;
	}

	flush() {
		this.keymap_active = {};
		this.data = [];
		this.rendered = [];
		this.invalid();
		//mb destruct all sessions? they have circular dependencies
	}

	add(session) {
		//only today
		if (!session || this.moment()
			.format('YYYY-MM-DD') !== session.dedication())
			return this;

		let id = session.identifier();
		session.onUpdate(this.invalidate.bind(this));
		let keymap = session.isInactive() ? this.keymap_inactive : this.keymap_active;

		if (keymap[id] === undefined) {
			this.data.push(session);
			keymap[id] = this.data.length - 1;
		} else {
			this.data[keymap[id]] = session;
		}
		this.invalidate();
		return this;
	}

	_markUpdate(date) {
		this._updated = date || this.moment()
			.format('YYYY-MM-DD');
	}

	_getUpdated() {
		return this._updated;
	}

	loadIfOutdated() {
		//it is logical because only today sessions can be added
		if (this._getUpdated() < this.moment()
			.format('YYYY-MM-DD')) {
			console.log("OUTDATED");
			this.flush();
			return this.load()
				.then(res => this.render())
				.then(res => this.order());
		} else {
			return Promise.resolve(true);
		}
	}

	load(spec_date) {
		let date = spec_date || this.moment()
			.format('YYYY-MM-DD');
		this.flush();
		return Promise.mapSeries(["TicketSession", "Ticket"], type => this.patchwerk.get(type, {
				department: this.name,
				date: date,
				counter: '*'
			}))
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
				this._markUpdate(date);
				// console.log("SESSIONS", this.data);
				// console.log("LOADED", this.allTickets());
				return this;
			})
	}

	saveSession(session) {
		let model = session.extract();
		console.log("Save session", this.name);
		return this.patchwerk.save(model, {
				department: session.attachment(),
				date: session.dedication()
			})
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

	virtualizeTicket(t_data) {
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
				// console.log("a-s crvirticks", tick);
				tick.unlockField('operator')
					.unlockField('destination')
					.modifyPriority('service', service_data.get('priority'));
				let hst = tick.get("history");
				_.map(hst, h_entry => {
					h_entry.local_time = this.moment()
						.format();
				});
				tick.set("history", hst);
				tick.set("called", 0);
				tick.set("inheritance_counter", 0);
				tick.set("source", null);
				tick.set("operator", null);
				tick.set("destination", null);

				if (tick.get('booking_method') == 'live') {
					tick.set('time_description', service_data.live_operation_time);
				} else {
					let td = tick.time_description;
					tick.set("time_description", [td[0], td[0] + service_data.prebook_operation_time * tick.get("service_count")])
				}
				return tick;
			});
	}

	createTickets(data) {
		let b_data = data.constructor === Array ? data : [data];

		return Promise.map(b_data, t_data => {
			t_data.booking_date = this.moment()
				.format();
			// console.log("TDATA", t_data);

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
						.modifyLabel(service_data.get('prefix'));
					if (tick.get("booking_method") == "prebook")
						tick.modifyLabel(this.keydata.prebook_label_prefix, "prepend");
					// console.log("a-s crticks II", tick);
					if (t_data.forced_label)
						tick.set("label", t_data.forced_label);
					if (tick.get('booking_method') == 'live')
						tick.set('time_description', service_data.live_operation_time);
					else {
						let td = tick.get("time_description");
						tick.set('time_description', [td[0], td[0] + service_data.prebook_operation_time * (tick.get("service_count") || 1)]);
					}
					tick.set("initial_time_description", tick.get("time_description"))
					return tick;
				});
		})
	}
}

module.exports = AggregatorSection;